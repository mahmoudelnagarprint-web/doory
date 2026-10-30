/**
 * Pipeline tests — deterministic, canvas-free.
 *
 * Every DOM-bound step arrives through `PipelineDeps` stubs, so no canvas/OffscreenCanvas is ever
 * touched: decoding, PNG encoding and compositing are all replaced by counting fakes. The real
 * engine modules (maskOps / regionSegment / classify / providers) run for real, so these tests
 * assert real end-to-end behaviour of the frozen pipeline contract.
 */
import { describe, expect, test } from 'vitest'
import { maskArea } from './maskOps'
import {
  assembleResult,
  clampBounds,
  classifyStage,
  cropMask,
  fullCanvasLayer,
  mapBoundsToPage,
  planRegions,
  runDeconstructionWith,
} from './pipeline'
import type { PipelineDeps } from './pipeline'
import type { DecodedSource } from './raster'
import type { SegmentedRegion } from './regionSegment'
import type {
  InpaintProvider,
  PixelMask,
  PipelineFailure,
  PipelineInput,
  PipelineOptions,
  PipelineOutcome,
  PipelineProgress,
  PipelineResult,
  Raster,
  SegmentationProvider,
  SegmentationRequest,
} from './types'

/* ───────────────────────────── fixtures ───────────────────────────── */

interface RgbColor {
  r: number
  g: number
  b: number
}

interface RectShape {
  x: number
  y: number
  width: number
  height: number
  color: RgbColor
}

const PAPER: RgbColor = { r: 240, g: 240, b: 240 }
const RED: RgbColor = { r: 200, g: 30, b: 30 }
const BLUE: RgbColor = { r: 30, g: 30, b: 200 }
const INK: RgbColor = { r: 25, g: 25, b: 25 }

/** 100x60 analysis raster, symmetric scale so page maths are exact (x2). */
const INPUT: PipelineInput = {
  imageUrl: 'data:image/png;base64,SOURCE',
  width: 100,
  height: 60,
  pageWidth: 200,
  pageHeight: 120,
}

const RECT_A: RectShape = { x: 10, y: 5, width: 40, height: 30, color: RED }
const RECT_B: RectShape = { x: 60, y: 25, width: 30, height: 30, color: BLUE }

/** Glyph-like "H" made of 3px strokes: survives a radius-1 opening, measures as thin strokes. */
const TEXT_SHAPES: RectShape[] = [
  { x: 10, y: 6, width: 3, height: 14, color: INK },
  { x: 46, y: 6, width: 3, height: 14, color: INK },
  { x: 10, y: 12, width: 39, height: 3, color: INK },
]

function buildRaster(width: number, height: number, shapes: RectShape[]): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = PAPER.r
    data[i * 4 + 1] = PAPER.g
    data[i * 4 + 2] = PAPER.b
    data[i * 4 + 3] = 255
  }
  for (const shape of shapes) {
    for (let y = shape.y; y < shape.y + shape.height; y++) {
      for (let x = shape.x; x < shape.x + shape.width; x++) {
        const offset = (y * width + x) * 4
        data[offset] = shape.color.r
        data[offset + 1] = shape.color.g
        data[offset + 2] = shape.color.b
        data[offset + 3] = 255
      }
    }
  }
  return { width, height, data }
}

function buildMask(width: number, height: number, shapes: RectShape[]): PixelMask {
  const mask = new Uint8Array(width * height)
  for (const shape of shapes) {
    for (let y = shape.y; y < shape.y + shape.height; y++) {
      for (let x = shape.x; x < shape.x + shape.width; x++) mask[y * width + x] = 255
    }
  }
  return mask
}

function sourceOf(raster: Raster): DecodedSource {
  return {
    width: raster.width,
    height: raster.height,
    data: raster.data,
    originalWidth: raster.width,
    originalHeight: raster.height,
    scale: 1,
  }
}

function alphaAt(raster: Raster, x: number, y: number): number {
  return raster.data[(y * raster.width + x) * 4 + 3]
}

function stubProvider(
  mask: PixelMask,
  options: { neural: boolean; id?: string; width?: number; height?: number; inner?: number },
): SegmentationProvider {
  return {
    id: options.id ?? (options.neural ? 'stub-neural' : 'stub-classical'),
    neural: options.neural,
    isAvailable: async () => true,
    segment: async (request: SegmentationRequest) => {
      if (options.inner !== undefined) request.onProgress?.(options.inner)
      return {
        foreground: mask,
        width: options.width ?? 100,
        height: options.height ?? 60,
        neural: options.neural,
        modelId: options.neural ? 'stub-model' : null,
      }
    },
  }
}

interface StubHarness {
  deps: PipelineDeps
  encoded: Raster[]
  masks: { mask: Uint8Array; width: number; height: number }[]
  composed: Raster[][]
}

function stubHarness(source: DecodedSource, onEncode?: () => void): StubHarness {
  const encoded: Raster[] = []
  const masks: { mask: Uint8Array; width: number; height: number }[] = []
  const composed: Raster[][] = []
  return {
    encoded,
    masks,
    composed,
    deps: {
      decode: async () => source,
      toDataUrl: async (raster: Raster) => {
        encoded.push(raster)
        onEncode?.()
        return `data:image/png;base64,ENCODED_${encoded.length}`
      },
      maskToDataUrl: async (mask: Uint8Array, width: number, height: number) => {
        masks.push({ mask, width, height })
        return `data:image/png;base64,MASK_${masks.length}`
      },
      compose: async (layers: Raster[]) => {
        composed.push(layers)
        return 'data:image/png;base64,COMPOSITE'
      },
    },
  }
}

function twoShapeSetup(shapes: RectShape[] = [RECT_A, RECT_B]): {
  source: DecodedSource
  mask: PixelMask
} {
  return {
    source: sourceOf(buildRaster(100, 60, shapes)),
    mask: buildMask(100, 60, shapes),
  }
}

function expectReady(outcome: PipelineOutcome): PipelineResult {
  if (outcome.status !== 'ready') {
    throw new Error(`expected status "ready", got "${outcome.status}": ${outcome.message}`)
  }
  return outcome
}

function expectFailed(outcome: PipelineOutcome): PipelineFailure {
  if (outcome.status !== 'failed') {
    throw new Error(`expected status "failed", got "${outcome.status}"`)
  }
  return outcome
}

function expectCancelled(outcome: PipelineOutcome): PipelineFailure {
  if (outcome.status !== 'cancelled') {
    throw new Error(`expected status "cancelled", got "${outcome.status}"`)
  }
  return outcome
}

function warningCodes(outcome: PipelineOutcome): string[] {
  return outcome.warnings.map((warning) => warning.code)
}

/* ───────────────────────── pure helpers ───────────────────────── */

describe('pure pipeline helpers', () => {
  test('mapBoundsToPage maps exact page coordinates with independent axis scales', () => {
    expect(mapBoundsToPage({ x: 10, y: 5, width: 20, height: 15 }, 100, 60, 300, 30)).toEqual({
      x: 30,
      y: 2.5,
      width: 60,
      height: 7.5,
    })
  })

  test('clampBounds keeps a region inside the raster and never returns a zero-size box', () => {
    expect(clampBounds({ x: -5, y: -5, width: 20, height: 20 }, 100, 60)).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    })
    expect(clampBounds({ x: 95, y: 55, width: 20, height: 20 }, 100, 60)).toEqual({
      x: 95,
      y: 55,
      width: 5,
      height: 5,
    })
    expect(clampBounds({ x: 100, y: 60, width: 20, height: 20 }, 100, 60)).toEqual({
      x: 99,
      y: 59,
      width: 1,
      height: 1,
    })
  })

  test('cropMask returns a bounds-sized window of the full mask', () => {
    const mask = new Uint8Array(6 * 4)
    mask[1 * 6 + 2] = 255
    const cropped = cropMask(mask, 6, { x: 2, y: 1, width: 2, height: 2 })
    expect(cropped.length).toBe(4)
    expect(Array.from(cropped)).toEqual([255, 0, 0, 0])
  })

  test('fullCanvasLayer keeps alignment: only the region is opaque', () => {
    const raster: Raster = {
      width: 4,
      height: 3,
      data: new Uint8ClampedArray(4 * 3 * 4).fill(255),
    }
    const mask = new Uint8Array(12)
    mask[1 * 4 + 1] = 255
    const layer = fullCanvasLayer(raster, mask, { x: 1, y: 1, width: 2, height: 1 })
    expect(layer.width).toBe(4)
    expect(layer.height).toBe(3)
    expect(alphaAt(layer, 1, 1)).toBe(255)
    expect(alphaAt(layer, 2, 1)).toBe(0)
    expect(alphaAt(layer, 0, 0)).toBe(0)
  })

  test('planRegions orders back-to-front by area and reports truncation', () => {
    const region = (area: number, x: number): SegmentedRegion => ({
      mask: new Uint8Array(0),
      bounds: { x, y: 0, width: 10, height: 10 },
      area,
      fillRatio: 1,
      meanColor: { r: 0, g: 0, b: 0 },
      touchesBorder: false,
      confidence: 1,
    })
    const { kept, truncated } = planRegions([region(50, 0), region(500, 1), region(50, 2)], 2)
    expect(kept.map((entry) => entry.area)).toEqual([500, 50])
    expect(kept.map((entry) => entry.bounds.x)).toEqual([1, 0])
    expect(truncated).toBe(1)
    expect(planRegions([region(50, 0)], 5).truncated).toBe(0)
  })

  test('classifyStage measures thin-stroke text evidence from the mask itself', () => {
    const raster = buildRaster(100, 60, TEXT_SHAPES)
    const mask = buildMask(100, 60, TEXT_SHAPES)
    const region: SegmentedRegion = {
      mask,
      bounds: { x: 10, y: 6, width: 39, height: 14 },
      area: maskArea(mask),
      fillRatio: maskArea(mask) / (39 * 14),
      meanColor: INK,
      touchesBorder: false,
      confidence: 0.6,
    }
    const classified = classifyStage(region, raster, PAPER)
    expect(classified.textCandidate).toBe(true)
    expect(classified.layerClass).toBe('text')
    expect(classified.confidence).toBeGreaterThan(0.4)
  })

  test('assembleResult produces the frozen ready shape', () => {
    const result = assembleResult({
      input: INPUT,
      layers: [],
      originalDataUrl: INPUT.imageUrl,
      reconstructedDataUrl: null,
      backgroundMethod: null,
      compositeDataUrl: 'data:image/png;base64,COMPOSITE',
      warnings: [],
      segmentationProviderId: 'stub',
      neural: false,
      durationMs: 7,
    })
    expect(result.status).toBe('ready')
    expect(result.input).toBe(INPUT)
    expect(result.background).toEqual({
      originalDataUrl: INPUT.imageUrl,
      reconstructedDataUrl: null,
      method: null,
    })
    expect(result.durationMs).toBe(7)
  })
})

/* ───────────────────────── happy path ───────────────────────── */

describe('runDeconstructionWith — happy path', () => {
  test('extracts two disjoint rectangles with exact bounds, page mapping and z-order', async () => {
    const { source, mask } = twoShapeSetup()
    const harness = stubHarness(source)
    const outcome = await runDeconstructionWith(
      INPUT,
      { providers: { segmentation: stubProvider(mask, { neural: true }) }, reconstructBackground: false },
      harness.deps,
    )
    const result = expectReady(outcome)

    expect(result.layers).toHaveLength(2)
    expect(result.neural).toBe(true)
    expect(result.segmentationProviderId).toBe('stub-neural')
    expect(result.originalDataUrl).toBe(INPUT.imageUrl)
    expect(result.compositeDataUrl).toBe('data:image/png;base64,COMPOSITE')
    expect(result.background.reconstructedDataUrl).toBeNull()
    expect(result.background.method).toBeNull()
    expect(result.durationMs).toBeGreaterThanOrEqual(0)

    const [back, front] = result.layers
    // back-to-front: the larger rectangle (900 px vs 1200 px) sits behind
    expect(back.bounds).toEqual({ x: 10, y: 5, width: 40, height: 30 })
    expect(front.bounds).toEqual({ x: 60, y: 25, width: 30, height: 30 })
    expect(back.zIndex).toBe(0)
    expect(front.zIndex).toBe(1)
    expect(back.page).toEqual({ x: 20, y: 10, width: 80, height: 60 })
    expect(front.page).toEqual({ x: 120, y: 50, width: 60, height: 60 })

    for (const layer of result.layers) {
      expect(layer.extractionMethod).toBe('model-segmentation')
      expect(layer.rotation).toBe(0)
      expect(layer.opacity).toBe(1)
      expect(layer.source).toEqual({ url: INPUT.imageUrl, width: 100, height: 60 })
      expect(layer.editableProperties).toEqual({
        movable: true,
        resizable: true,
        removable: true,
        textEditable: false,
      })
      expect(layer.confidence).toBeGreaterThan(0.35)
      expect(layer.croppedDataUrl).toMatch(/^data:image\/png;base64,ENCODED_/)
      expect(layer.alphaMaskDataUrl).toMatch(/^data:image\/png;base64,MASK_/)
    }
    expect(result.warnings).toEqual([])
  })

  test('cropped, full-canvas and alpha-mask rasters have the exact expected geometry', async () => {
    const { source, mask } = twoShapeSetup()
    const harness = stubHarness(source)
    const outcome = await runDeconstructionWith(
      INPUT,
      { providers: { segmentation: stubProvider(mask, { neural: true }) }, reconstructBackground: false },
      harness.deps,
    )
    expectReady(outcome)

    // per layer: cropped then full canvas
    expect(harness.encoded.map((raster) => `${raster.width}x${raster.height}`)).toEqual([
      '40x30',
      '100x60',
      '30x30',
      '100x60',
    ])
    const fullBack = harness.encoded[1]
    expect(alphaAt(fullBack, 10, 5)).toBe(255)
    expect(alphaAt(fullBack, 45, 30)).toBe(255)
    expect(alphaAt(fullBack, 60, 25)).toBe(0)
    expect(alphaAt(fullBack, 0, 0)).toBe(0)
    // pixel colours are preserved, not flattened
    const inside = (5 * 100 + 10) * 4
    expect(Array.from(fullBack.data.subarray(inside, inside + 3))).toEqual([RED.r, RED.g, RED.b])

    // the alpha mask travels at bounds size, matching the cropped image
    expect(harness.masks.map((entry) => `${entry.width}x${entry.height}`)).toEqual(['40x30', '30x30'])
    expect(maskArea(harness.masks[0].mask)).toBe(1200)
    expect(maskArea(harness.masks[1].mask)).toBe(900)

    // compose receives background first, then the layers in z order
    expect(harness.composed).toHaveLength(1)
    expect(harness.composed[0]).toHaveLength(3)
    expect(harness.composed[0][0]).toBe(source)
    expect(harness.composed[0][1]).toBe(harness.encoded[1])
    expect(harness.composed[0][2]).toBe(harness.encoded[3])
  })
})

/* ───────────────────────── honesty: classical vs neural ───────────────────────── */

describe('runDeconstructionWith — extraction honesty', () => {
  test('a non-neural provider reports model-unavailable and classical extraction', async () => {
    const { source, mask } = twoShapeSetup()
    const harness = stubHarness(source)
    const outcome = await runDeconstructionWith(
      INPUT,
      {
        providers: { segmentation: stubProvider(mask, { neural: false }) },
        reconstructBackground: false,
      },
      harness.deps,
    )
    const result = expectReady(outcome)
    expect(result.neural).toBe(false)
    expect(result.segmentationProviderId).toBe('stub-classical')
    expect(warningCodes(result)).toContain('model-unavailable')
    expect(result.layers).toHaveLength(2)
    expect(result.layers.every((layer) => layer.extractionMethod === 'classical-segmentation')).toBe(true)
  })

  test('a provider whose mask resolution differs from the analysis raster is resized', async () => {
    const { source } = twoShapeSetup()
    // mask authored at 50x30: both rectangles exist at half scale (20x15 and 15x15)
    const halfMask = buildMask(50, 30, [
      { x: 5, y: 2, width: 20, height: 15, color: RED },
      { x: 30, y: 12, width: 15, height: 15, color: BLUE },
    ])
    const harness = stubHarness(source)
    const outcome = await runDeconstructionWith(
      INPUT,
      {
        providers: { segmentation: stubProvider(halfMask, { neural: true, width: 50, height: 30 }) },
        reconstructBackground: false,
      },
      harness.deps,
    )
    const result = expectReady(outcome)

    // The half-size mask was promoted to analysis resolution: a 20px-wide rectangle can only be
    // reported as 40px wide if `resizeMask` ran, and the covered ink matches the doubled area.
    const widths = result.layers.map((layer) => layer.bounds.width)
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(40)
    const coveredArea = harness.masks.reduce((sum, entry) => sum + maskArea(entry.mask), 0)
    expect(coveredArea).toBeGreaterThanOrEqual(40 * 30)
    // every layer is expressed in analysis pixels, never in the provider's 50x30 space
    for (const layer of result.layers) {
      expect(layer.bounds.x).toBeGreaterThanOrEqual(0)
      expect(layer.bounds.y).toBeGreaterThanOrEqual(0)
      expect(layer.bounds.x + layer.bounds.width).toBeLessThanOrEqual(100)
      expect(layer.bounds.y + layer.bounds.height).toBeLessThanOrEqual(60)
      expect(layer.page.width).toBeCloseTo(layer.bounds.width * (INPUT.pageWidth / 100), 6)
    }
  })

  test('a provider that claims neural but reports a classical output is not trusted', async () => {
    const { source, mask } = twoShapeSetup()
    const harness = stubHarness(source)
    const dishonest: SegmentationProvider = {
      id: 'stub-dishonest',
      neural: true,
      isAvailable: async () => true,
      segment: async () => ({
        foreground: mask,
        width: 100,
        height: 60,
        neural: false,
        modelId: null,
      }),
    }
    const result = expectReady(
      await runDeconstructionWith(
        INPUT,
        { providers: { segmentation: dishonest }, reconstructBackground: false },
        harness.deps,
      ),
    )
    expect(result.neural).toBe(false)
    expect(result.layers.every((layer) => layer.extractionMethod === 'classical-segmentation')).toBe(true)
    expect(warningCodes(result)).toContain('classical-fallback')
    expect(warningCodes(result)).not.toContain('model-unavailable')
  })

  test('a provider that throws fails the segment stage and produces no layers', async () => {
    const { source } = twoShapeSetup()
    const harness = stubHarness(source)
    const failing: SegmentationProvider = {
      id: 'stub-failing',
      neural: true,
      isAvailable: async () => true,
      segment: async () => {
        throw new Error('فشل المحرك الاصطناعي')
      },
    }
    const outcome = await runDeconstructionWith(
      INPUT,
      { providers: { segmentation: failing } },
      harness.deps,
    )
    const failure = expectFailed(outcome)
    expect(failure.stage).toBe('segment')
    expect(failure.message).toBe('فشل المحرك الاصطناعي')
    expect('layers' in outcome).toBe(false)
    expect(harness.encoded).toHaveLength(0)
    expect(harness.composed).toHaveLength(0)
  })

  test('a provider that returns a mis-sized mask fails the segment stage', async () => {
    const { source } = twoShapeSetup()
    const harness = stubHarness(source)
    const broken: SegmentationProvider = {
      id: 'stub-broken',
      neural: true,
      isAvailable: async () => true,
      segment: async () => ({
        foreground: new Uint8Array(10),
        width: 100,
        height: 60,
        neural: true,
        modelId: null,
      }),
    }
    const failure = expectFailed(
      await runDeconstructionWith(INPUT, { providers: { segmentation: broken } }, harness.deps),
    )
    expect(failure.stage).toBe('segment')
    expect(failure.message).toContain('قناعاً بأبعاد غير صالحة')
  })
})

/* ───────────────────────── failure/limit paths ───────────────────────── */

describe('runDeconstructionWith — limits and failures', () => {
  test('maxLayers truncates to the largest regions and warns', async () => {
    const { source, mask } = twoShapeSetup()
    const harness = stubHarness(source)
    const outcome = await runDeconstructionWith(
      INPUT,
      {
        maxLayers: 1,
        providers: { segmentation: stubProvider(mask, { neural: true }) },
        reconstructBackground: false,
      },
      harness.deps,
    )
    const result = expectReady(outcome)
    expect(result.layers).toHaveLength(1)
    expect(result.layers[0].bounds).toEqual({ x: 10, y: 5, width: 40, height: 30 })
    expect(result.layers[0].zIndex).toBe(0)
    expect(warningCodes(result)).toContain('truncated-layers')
  })

  test('zero foreground fails at extract and is never reported as ready', async () => {
    const { source } = twoShapeSetup()
    const harness = stubHarness(source)
    const empty: PixelMask = new Uint8Array(100 * 60)
    const outcome = await runDeconstructionWith(
      INPUT,
      {
        providers: { segmentation: stubProvider(empty, { neural: true }) },
        reconstructBackground: false,
      },
      harness.deps,
    )
    const failure = expectFailed(outcome)
    expect(failure.status).not.toBe('ready')
    expect(failure.stage).toBe('extract')
    expect(failure.message.length).toBeGreaterThan(0)
    expect(failure.warnings.map((warning) => warning.code)).toContain('no-elements')
    expect(harness.encoded).toHaveLength(0)
  })

  test('cancelling before start returns cancelled at validate', async () => {
    const { source, mask } = twoShapeSetup()
    const harness = stubHarness(source)
    const controller = new AbortController()
    controller.abort()
    const outcome = await runDeconstructionWith(
      INPUT,
      {
        signal: controller.signal,
        providers: { segmentation: stubProvider(mask, { neural: true }) },
      },
      harness.deps,
    )
    expect(outcome.status).toBe('cancelled')
    expect(expectCancelled(outcome).stage).toBe('validate')
    expect(harness.encoded).toHaveLength(0)
  })

  test('an abort raised during extraction returns cancelled at extract', async () => {
    const { source, mask } = twoShapeSetup()
    const controller = new AbortController()
    const harness = stubHarness(source, () => controller.abort())
    const outcome = await runDeconstructionWith(
      INPUT,
      {
        signal: controller.signal,
        providers: { segmentation: stubProvider(mask, { neural: true }) },
        reconstructBackground: false,
      },
      harness.deps,
    )
    expect(outcome.status).toBe('cancelled')
    expect(expectCancelled(outcome).stage).toBe('extract')
    expect(harness.composed).toHaveLength(0)
  })

  test('invalid input is rejected at validate without decoding', async () => {
    const { source } = twoShapeSetup()
    let decoded = false
    const deps: PipelineDeps = {
      decode: async () => {
        decoded = true
        return source
      },
      toDataUrl: async () => 'data:image/png;base64,X',
      maskToDataUrl: async () => 'data:image/png;base64,X',
      compose: async () => 'data:image/png;base64,X',
    }
    const failure = expectFailed(
      await runDeconstructionWith({ ...INPUT, pageWidth: 0 }, {}, deps),
    )
    expect(failure.stage).toBe('validate')
    expect(decoded).toBe(false)
  })

  test('a decode failure is reported at validate with the real message', async () => {
    const deps: PipelineDeps = {
      decode: async () => {
        throw new Error('تعذّر تحميل الصورة')
      },
    }
    const failure = expectFailed(await runDeconstructionWith(INPUT, {}, deps))
    expect(failure.stage).toBe('validate')
    expect(failure.message).toBe('تعذّر تحميل الصورة')
  })

  test('an analysis-downscaled source is reported honestly with decode-limited', async () => {
    const { source, mask } = twoShapeSetup()
    const scaled: DecodedSource = { ...source, originalWidth: 200, originalHeight: 120, scale: 0.5 }
    const harness = stubHarness(scaled)
    const result = expectReady(
      await runDeconstructionWith(
        INPUT,
        { providers: { segmentation: stubProvider(mask, { neural: true }) }, reconstructBackground: false },
        harness.deps,
      ),
    )
    expect(warningCodes(result)).toContain('decode-limited')
    // layers are still mapped into page units through the analysis raster
    expect(result.layers[0].page).toEqual({ x: 20, y: 10, width: 80, height: 60 })
  })
})

/* ───────────────────────── OCR honesty ───────────────────────── */

describe('runDeconstructionWith — OCR', () => {
  test('text candidates stay raster images with ocr-unavailable when no engine exists', async () => {
    const source = sourceOf(buildRaster(100, 60, TEXT_SHAPES))
    const mask = buildMask(100, 60, TEXT_SHAPES)
    const harness = stubHarness(source)
    const outcome = await runDeconstructionWith(
      INPUT,
      { providers: { segmentation: stubProvider(mask, { neural: true }) }, reconstructBackground: false },
      harness.deps,
    )
    const result = expectReady(outcome)
    expect(result.layers).toHaveLength(1)
    const layer = result.layers[0]
    expect(layer.text).toBeDefined()
    expect(layer.text?.recognised).toBe(false)
    expect(layer.text?.content).toBe('')
    expect(layer.text?.engine).toBeNull()
    expect(layer.text?.fontSize).toBeGreaterThan(0)
    expect(layer.editableProperties.textEditable).toBe(false)
    expect(warningCodes(result)).toContain('ocr-unavailable')
  })

  test('detectText:false produces no text payload and no OCR warning', async () => {
    const source = sourceOf(buildRaster(100, 60, TEXT_SHAPES))
    const mask = buildMask(100, 60, TEXT_SHAPES)
    const harness = stubHarness(source)
    const outcome = await runDeconstructionWith(
      INPUT,
      {
        detectText: false,
        providers: { segmentation: stubProvider(mask, { neural: true }) },
        reconstructBackground: false,
      },
      harness.deps,
    )
    const result = expectReady(outcome)
    expect(result.layers[0].text).toBeUndefined()
    expect(warningCodes(result)).not.toContain('ocr-unavailable')
  })

  test('an injected OCR provider supplies real recognised text', async () => {
    const source = sourceOf(buildRaster(100, 60, TEXT_SHAPES))
    const mask = buildMask(100, 60, TEXT_SHAPES)
    const harness = stubHarness(source)
    const outcome = await runDeconstructionWith(
      INPUT,
      {
        providers: {
          segmentation: stubProvider(mask, { neural: true }),
          ocr: {
            id: 'stub-ocr',
            isAvailable: async () => true,
            recognise: async () => ({ text: 'وُلِدَ', engine: 'stub-ocr' }),
          },
        },
        reconstructBackground: false,
      },
      harness.deps,
    )
    const result = expectReady(outcome)
    const layer = result.layers[0]
    expect(layer.text?.recognised).toBe(true)
    expect(layer.text?.content).toBe('وُلِدَ')
    expect(layer.text?.engine).toBe('stub-ocr')
    expect(layer.editableProperties.textEditable).toBe(true)
    expect(warningCodes(result)).not.toContain('ocr-unavailable')
  })
})

/* ───────────────────────── background reconstruction ───────────────────────── */

describe('runDeconstructionWith — background reconstruction', () => {
  function healedRaster(width = 100, height = 60): Raster {
    return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(180) }
  }

  test('uses the inpaint provider, dilates the holes mask and composes over the healed background', async () => {
    const { source, mask } = twoShapeSetup()
    const harness = stubHarness(source)
    const healed = healedRaster()
    const received: { mask: PixelMask | null; raster: Raster | null } = { mask: null, raster: null }
    const inpaint: InpaintProvider = {
      id: 'stub-inpaint',
      neural: true,
      isAvailable: async () => true,
      inpaint: async (raster, holes) => {
        received.mask = holes
        received.raster = raster
        return healed
      },
    }
    const outcome = await runDeconstructionWith(
      INPUT,
      { providers: { segmentation: stubProvider(mask, { neural: true }), inpaint } },
      harness.deps,
    )
    const result = expectReady(outcome)
    expect(result.background.method).toBe('stub-inpaint')
    expect(result.background.reconstructedDataUrl).not.toBeNull()
    expect(received.raster).toBe(source)
    // the union of both element masks was grown before healing (1200 + 900 = 2100 raw pixels)
    expect(received.mask).not.toBeNull()
    expect(maskArea(received.mask!)).toBeGreaterThan(2100)
    // compose drew the healed raster underneath every layer
    expect(harness.composed[0][0]).toBe(healed)
    expect(harness.composed[0]).toHaveLength(3)
    expect(warningCodes(result)).not.toContain('inpaint-classical')
  })

  test('a failing inpaint provider degrades honestly instead of failing the run', async () => {
    const { source, mask } = twoShapeSetup()
    const harness = stubHarness(source)
    const broken: InpaintProvider = {
      id: 'stub-broken-inpaint',
      neural: true,
      isAvailable: async () => true,
      inpaint: async () => {
        throw new Error('boom')
      },
    }
    const outcome = await runDeconstructionWith(
      INPUT,
      { providers: { segmentation: stubProvider(mask, { neural: true }), inpaint: broken } },
      harness.deps,
    )
    const result = expectReady(outcome)
    expect(result.background.reconstructedDataUrl).toBeNull()
    expect(result.background.method).toBeNull()
    expect(warningCodes(result)).toContain('inpaint-classical')
    // the original image is still the composed background
    expect(harness.composed[0][0]).toBe(source)
  })

  test('reconstructBackground:false skips the stage entirely', async () => {
    const { source, mask } = twoShapeSetup()
    const harness = stubHarness(source)
    let called = false
    const inpaint: InpaintProvider = {
      id: 'stub-inpaint',
      neural: true,
      isAvailable: async () => true,
      inpaint: async () => {
        called = true
        return healedRaster()
      },
    }
    const outcome = await runDeconstructionWith(
      INPUT,
      {
        reconstructBackground: false,
        providers: { segmentation: stubProvider(mask, { neural: true }), inpaint },
      },
      harness.deps,
    )
    const result = expectReady(outcome)
    expect(called).toBe(false)
    expect(result.background.reconstructedDataUrl).toBeNull()
    expect(harness.composed[0][0]).toBe(source)
  })
})

/* ───────────────────────── progress ───────────────────────── */

describe('runDeconstructionWith — progress reporting', () => {
  test('percentages are monotonically non-decreasing and end at 100', async () => {
    const { source, mask } = twoShapeSetup()
    const harness = stubHarness(source)
    const progress: PipelineProgress[] = []
    const options: PipelineOptions = {
      providers: { segmentation: stubProvider(mask, { neural: true, inner: 50 }) },
      reconstructBackground: false,
      onProgress: (entry) => progress.push(entry),
    }
    const result = expectReady(await runDeconstructionWith(INPUT, options, harness.deps))

    expect(progress.length).toBeGreaterThan(4)
    expect(progress[0]).toEqual({ stage: 'validate', percent: 0, message: expect.any(String) })
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i].percent).toBeGreaterThanOrEqual(progress[i - 1].percent)
      expect(progress[i].message.length).toBeGreaterThan(0)
      expect(Number.isInteger(progress[i].percent)).toBe(true)
    }
    expect(progress[progress.length - 1]).toEqual({
      stage: 'ready',
      percent: 100,
      message: expect.any(String),
    })
    expect(result.status).toBe('ready')

    const stages = progress.map((entry) => entry.stage)
    expect(stages).toContain('analyze')
    expect(stages).toContain('segment')
    expect(stages).toContain('classify')
    expect(stages).toContain('extract')
    expect(stages).toContain('compose')
    // the provider's own 50% report lands inside the segment window (12..45)
    const segmentPercents = progress.filter((entry) => entry.stage === 'segment').map((e) => e.percent)
    expect(Math.min(...segmentPercents)).toBeGreaterThanOrEqual(10)
    expect(Math.max(...segmentPercents)).toBeLessThanOrEqual(45)
    expect(segmentPercents).toContain(29)
    // compose and ready are the final timeline entries
    expect(stages.lastIndexOf('compose')).toBeLessThan(stages.lastIndexOf('ready'))
  })
})
