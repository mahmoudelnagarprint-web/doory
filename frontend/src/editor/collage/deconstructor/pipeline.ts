/**
 * Design Decomposer — orchestration pipeline.
 *
 * `runDeconstruction` turns one flat design image into real, independently editable layers:
 * validate → analyze → segment → classify → extract → reconstruct-background → compose → ready.
 *
 * Structure (this is what makes it testable in jsdom with **no canvas**):
 *  - every pure step is a plain exported function operating on typed arrays:
 *    `clampBounds`, `cropMask`, `fullCanvasLayer`, `mapBoundsToPage`, `classifyStage`,
 *    `planRegions`, `assembleResult`;
 *  - every DOM-bound step arrives through `PipelineDeps` (`decode` / `toDataUrl` / `maskToDataUrl`
 *    / `compose`), which production wires to `raster.ts` and tests replace with deterministic
 *    stubs. No canvas call is ever faked inside this module.
 *
 * Honesty rules enforced here:
 *  - progress percentages are measured from finished work units and are monotonically
 *    non-decreasing;
 *  - an empty result is never dressed as success (zero regions → `failed` at `extract`);
 *  - a classical mask is never labelled as neural (`extractionMethod` + `neural` both derive from
 *    the provider's real `neural` flag AND the provider's own output flag);
 *  - text is never invented: without a real OCR engine the layer stays a raster image and the
 *    run reports `ocr-unavailable`.
 */
import { classifyRegion } from './classify'
import type { ClassifyFeatures } from './classify'
import {
  cutElement,
  dilate,
  erode,
  fillHoles,
  maskArea,
  openMask,
  resizeMask,
  unionMask,
} from './maskOps'
import { ocrUnavailableWarning, resolveOcrProvider } from './ocr'
import { resolveInpaintProvider, resolveSegmentationProvider } from './providers'
import { colorDistance, decomposeRegions, estimateBackgroundColor } from './regionSegment'
import type { SegmentedRegion } from './regionSegment'
import {
  composeRasters,
  decodeSource,
  maskToDataUrl as encodeMaskDataUrl,
  rasterToDataUrl,
} from './raster'
import type { DecodedSource } from './raster'
import type {
  ExtractedLayer,
  InpaintProvider,
  LayerClass,
  PixelMask,
  PixelRect,
  PipelineFailure,
  PipelineInput,
  PipelineOptions,
  PipelineOutcome,
  PipelineResult,
  PipelineStage,
  PipelineWarning,
  Raster,
  SegmentationOutput,
  SegmentationProvider,
  TextLayerData,
} from './types'

/* ────────────────────────────────────────────────────────────────────────────
 * Tunables (all documented, none invented at runtime).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Smallest kept element as a fraction of the image (frozen contract default). */
const DEFAULT_MIN_AREA_FRACTION = 0.0004
/** Hard cap on extracted layers (frozen contract default). */
const DEFAULT_MAX_LAYERS = 60
/** Chebyshev RGB distance used when grouping neighbouring pixels into one region. */
const DEFAULT_COLOR_TOLERANCE = 28
/** Internal ceiling so a pathological image can never ask for unbounded regions. */
const MAX_REGIONS_HARD_CEILING = 256
/** Structural opening radius that removes single-pixel speckle from the foreground mask. */
const FOREGROUND_OPEN_RADIUS = 1
/** Background mask is grown by this many pixels before healing, so no halo of the old element remains. */
const BACKGROUND_DILATE_RADIUS = 2
/** Below this a layer is surfaced with a `low-confidence` warning. */
const LOW_CONFIDENCE_THRESHOLD = 0.35
/** Documented substitute: a raster font can never be recovered, so text layers start on the app font. */
const RASTER_FONT_SUBSTITUTE = 'Cairo'
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 480

/* Overall percentage thresholds per stage. Values are fixed work-unit boundaries. */
const ANALYZE_END = 10
const SEGMENT_START = 10
const SEGMENT_INNER_START = 12
const SEGMENT_END = 45
const CLASSIFY_START = 45
const CLASSIFY_END = 60
const EXTRACT_END = 80
const RECONSTRUCT_START = 80
const RECONSTRUCT_END = 92
const COMPOSE_START = 92
const COMPOSE_END = 99

/** Arabic, user-facing name per detected class. */
const CLASS_LABEL_AR: Readonly<Record<LayerClass, string>> = {
  background: 'خلفية',
  photo: 'صورة',
  person: 'شخص',
  frame: 'إطار',
  sticker: 'ملصق',
  decoration: 'زخرفة',
  text: 'نص',
  logo: 'شعار',
  shape: 'شكل',
  shadow: 'ظل',
  other: 'عنصر',
  unknown: 'عنصر',
}

/* ────────────────────────────────────────────────────────────────────────────
 * Injectable raster/DOM seam.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Canvas/DOM boundary used by the pipeline. Production passes `raster.ts`; tests pass stubs. */
export interface PipelineDeps {
  decode?: (url: string, opts?: { signal?: AbortSignal }) => Promise<DecodedSource>
  toDataUrl?: (raster: Raster) => Promise<string>
  maskToDataUrl?: (mask: Uint8Array, w: number, h: number) => Promise<string>
  compose?: (layers: Raster[]) => Promise<string>
}

interface Rgb {
  r: number
  g: number
  b: number
}

/* ────────────────────────────────────────────────────────────────────────────
 * Small pure utilities.
 * ──────────────────────────────────────────────────────────────────────────── */

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return fallback
}

/** Keeps one warning per code, so a per-layer problem is reported exactly once. */
function pushWarning(list: PipelineWarning[], warning: PipelineWarning): void {
  if (!list.some((existing) => existing.code === warning.code)) list.push(warning)
}

function rgbToHex(color: Rgb): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

/** Deterministic layer id (no randomness: the same image always yields the same ids). */
export function layerId(index: number): string {
  return `layer-${String(Math.max(0, index) + 1).padStart(2, '0')}`
}

/* ────────────────────────────────────────────────────────────────────────────
 * Pure geometry / raster helpers (canvas-free, directly unit-testable).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Clamps a region rectangle into the raster and guarantees at least one pixel. */
export function clampBounds(bounds: PixelRect, width: number, height: number): PixelRect {
  const x = Math.max(0, Math.min(Math.max(0, width - 1), Math.floor(bounds.x)))
  const y = Math.max(0, Math.min(Math.max(0, height - 1), Math.floor(bounds.y)))
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(bounds.width))),
    height: Math.max(1, Math.min(height - y, Math.round(bounds.height))),
  }
}

/** Copies the `bounds` window out of a full-raster mask (the alpha mask travels with the crop). */
export function cropMask(mask: PixelMask, sourceWidth: number, bounds: PixelRect): PixelMask {
  const out = new Uint8Array(bounds.width * bounds.height)
  for (let y = 0; y < bounds.height; y++) {
    const rowStart = (bounds.y + y) * sourceWidth + bounds.x
    out.set(mask.subarray(rowStart, rowStart + bounds.width), y * bounds.width)
  }
  return out
}

/**
 * Builds the full-canvas transparent layer for one region: element pixels keep their colour with
 * `alpha = sourceAlpha * mask / 255`, everything else stays fully transparent. Alignment with the
 * original image is therefore preserved pixel for pixel.
 */
export function fullCanvasLayer(raster: Raster, mask: PixelMask, bounds: PixelRect): Raster {
  const data = new Uint8ClampedArray(raster.width * raster.height * 4)
  for (let y = 0; y < bounds.height; y++) {
    const rowStart = (bounds.y + y) * raster.width + bounds.x
    for (let x = 0; x < bounds.width; x++) {
      const index = rowStart + x
      const coverage = mask[index]
      if (coverage === 0) continue
      const offset = index * 4
      data[offset] = raster.data[offset]
      data[offset + 1] = raster.data[offset + 1]
      data[offset + 2] = raster.data[offset + 2]
      data[offset + 3] = Math.round((raster.data[offset + 3] * coverage) / 255)
    }
  }
  return { width: raster.width, height: raster.height, data }
}

/**
 * Maps analysis-pixel bounds to page pixels. Region detection runs on the analysis raster, so the
 * scale factor is `pageSize / analysisSize` — this is the same placement the user sees, expressed
 * in page units.
 */
export function mapBoundsToPage(
  bounds: PixelRect,
  analysisWidth: number,
  analysisHeight: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const sx = pageWidth / Math.max(1, analysisWidth)
  const sy = pageHeight / Math.max(1, analysisHeight)
  return {
    x: bounds.x * sx,
    y: bounds.y * sy,
    width: bounds.width * sx,
    height: bounds.height * sy,
  }
}

/** Back-to-front planning: bigger regions sit further back (larger area = smaller zIndex). */
export function planRegions(
  regions: readonly SegmentedRegion[],
  maxLayers: number,
): { kept: SegmentedRegion[]; truncated: number } {
  const ordered = [...regions].sort((a, b) => b.area - a.area)
  const kept = ordered.slice(0, Math.max(1, maxLayers))
  return { kept, truncated: Math.max(0, ordered.length - kept.length) }
}

/**
 * Classifies one region from real measurements only (area, fill ratio, aspect, colour, border
 * contact, measured thin-stroke evidence and the Chebyshev contrast against the background).
 *
 * `textCandidate` is measured, not guessed: the mask is eroded by one pixel and the region counts
 * as thin-stroked when at least half of its ink disappears — the signature of glyph strokes.
 */
export function classifyStage(
  region: SegmentedRegion,
  raster: Raster,
  background: Rgb,
): { layerClass: LayerClass; confidence: number; textCandidate: boolean; features: ClassifyFeatures } {
  const bounds = clampBounds(region.bounds, raster.width, raster.height)
  const area = Math.max(1, region.area)
  const eroded = maskArea(erode(region.mask, raster.width, raster.height, 1))
  const thinStrokes = eroded * 2 <= area
  const aspect = bounds.width / Math.max(1, bounds.height)
  const features: ClassifyFeatures = {
    bounds,
    areaFraction: region.area / Math.max(1, raster.width * raster.height),
    aspect,
    fillRatio: region.fillRatio,
    touchesBorder: region.touchesBorder,
    meanColor: region.meanColor,
    textCandidate: thinStrokes && aspect >= 1.2 && region.fillRatio <= 0.6,
    contrastAgainstBackground: colorDistance(region.meanColor, background),
  }
  const classified = classifyRegion(features)
  return {
    layerClass: classified.layerClass,
    confidence: classified.confidence,
    textCandidate: features.textCandidate,
    features,
  }
}

/** Estimated font size in page pixels from the region height (documented approximation). */
function estimateFontSize(bounds: PixelRect): number {
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(bounds.height * 0.55)))
}

/** An honest text payload for a text candidate that no engine could recognise. */
function unrecognisedText(color: Rgb, fontSize: number): TextLayerData {
  return {
    content: '',
    fontFamily: RASTER_FONT_SUBSTITUTE,
    fontSize,
    color: rgbToHex(color),
    align: 'center',
    direction: 'rtl',
    recognised: false,
    engine: null,
  }
}

export interface AssembleResultParams {
  input: PipelineInput
  layers: ExtractedLayer[]
  originalDataUrl: string
  reconstructedDataUrl: string | null
  backgroundMethod: string | null
  compositeDataUrl: string
  warnings: PipelineWarning[]
  segmentationProviderId: string
  neural: boolean
  durationMs: number
}

/** Final result assembly — pure, so the frozen `ready` shape is unit-testable on its own. */
export function assembleResult(params: AssembleResultParams): PipelineResult {
  return {
    status: 'ready',
    input: params.input,
    originalDataUrl: params.originalDataUrl,
    layers: params.layers,
    background: {
      originalDataUrl: params.originalDataUrl,
      reconstructedDataUrl: params.reconstructedDataUrl,
      method: params.backgroundMethod,
    },
    compositeDataUrl: params.compositeDataUrl,
    warnings: params.warnings,
    segmentationProviderId: params.segmentationProviderId,
    neural: params.neural,
    durationMs: params.durationMs,
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Public entry points.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Production entry point: the DOM boundary is wired to `raster.ts`. */
export async function runDeconstruction(
  input: PipelineInput,
  options?: PipelineOptions,
): Promise<PipelineOutcome> {
  return runDeconstructionWith(input, options, {
    decode: decodeSource,
    toDataUrl: rasterToDataUrl,
    maskToDataUrl: encodeMaskDataUrl,
    compose: composeRasters,
  })
}

/**
 * Dependency-injected entry point (tests pass deterministic stubs, no canvas involved).
 *
 * Aborts at any await boundary return `{ status: 'cancelled', stage }`. The `input` object is
 * never mutated; failures always carry the messages and warnings collected so far.
 */
export async function runDeconstructionWith(
  input: PipelineInput,
  options: PipelineOptions | undefined,
  deps: PipelineDeps,
): Promise<PipelineOutcome> {
  const decode = deps.decode ?? decodeSource
  const encodeRaster = deps.toDataUrl ?? rasterToDataUrl
  const encodeMask = deps.maskToDataUrl ?? encodeMaskDataUrl
  const compose = deps.compose ?? composeRasters

  const warnings: PipelineWarning[] = []
  const signal = options?.signal
  const started = now()
  let stage: PipelineStage = 'validate'
  let lastPercent = 0

  /** Monotonic progress: rounded, clamped to [lastPercent, 100] so no stage can move backwards. */
  const emit = (nextStage: PipelineStage, percent: number, message: string): void => {
    const value = Math.max(lastPercent, Math.min(100, Math.round(percent)))
    lastPercent = value
    options?.onProgress?.({ stage: nextStage, percent: value, message })
  }
  const fail = (failedStage: PipelineStage, message: string): PipelineFailure => ({
    status: 'failed',
    stage: failedStage,
    message,
    warnings,
  })
  const cancelled = (): PipelineFailure => ({
    status: 'cancelled',
    stage,
    message: 'أُلغيت عملية تفكيك التصميم.',
    warnings,
  })

  /* ── 1. validate ───────────────────────────────────────────────────────── */
  stage = 'validate'
  emit('validate', 0, 'التحقق من الصورة المدخلة…')
  if (signal?.aborted) return cancelled()
  if (!input.imageUrl) return fail('validate', 'لا توجد صورة مُحدَّدة لتفكيكها.')
  if (!(input.width > 0) || !(input.height > 0)) return fail('validate', 'أبعاد الصورة غير صالحة.')
  if (!(input.pageWidth > 0) || !(input.pageHeight > 0)) {
    return fail('validate', 'أبعاد الصفحة غير صالحة.')
  }

  let source: DecodedSource
  try {
    source = await decode(input.imageUrl, { signal })
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) return cancelled()
    return fail(
      'validate',
      errorMessage(error, 'تعذّر فك ترميز الصورة. تأكد من أنها صورة PNG أو JPG صالحة.'),
    )
  }
  if (signal?.aborted) return cancelled()
  if (!(source.width > 0) || !(source.height > 0)) {
    return fail('validate', 'أبعاد الصورة بعد فك الترميز غير صالحة.')
  }
  if (source.scale < 1) {
    warnings.push({
      code: 'decode-limited',
      message: `تم تحليل الصورة بدقة ${source.width}×${source.height} للحفاظ على سرعة المعالجة؛ الطبقات الناتجة بهذه الدقة.`,
    })
  }

  /* ── 2. analyze ────────────────────────────────────────────────────────── */
  stage = 'analyze'
  emit('analyze', 2, 'تحليل ألوان الصورة وتقدير لون الخلفية…')
  let background: Rgb
  try {
    background = estimateBackgroundColor(source)
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) return cancelled()
    return fail('analyze', errorMessage(error, 'تعذّر تحليل ألوان الصورة.'))
  }
  if (signal?.aborted) return cancelled()
  emit('analyze', ANALYZE_END, `تم تقدير لون الخلفية ${rgbToHex(background)}.`)

  /* ── 3. segment ────────────────────────────────────────────────────────── */
  stage = 'segment'
  emit('segment', SEGMENT_START, 'تجهيز محرك فصل العناصر…')
  let provider: SegmentationProvider
  try {
    const resolved = await resolveSegmentationProvider(options?.providers?.segmentation, signal)
    provider = resolved.provider
    for (const warning of resolved.warnings) pushWarning(warnings, warning)
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) return cancelled()
    return fail('segment', errorMessage(error, 'لا يوجد محرك فصل عناصر متاح.'))
  }
  if (signal?.aborted) return cancelled()
  if (!provider.neural) {
    pushWarning(warnings, {
      code: 'model-unavailable',
      message: 'لا يوجد نموذج فصل عصبي مُثبَّت؛ تم استخدام التحليل الكلاسيكي لتحديد العناصر.',
    })
  }
  emit('segment', SEGMENT_INNER_START, `تشغيل محرك الفصل (${provider.id})…`)

  let output: SegmentationOutput
  try {
    output = await provider.segment({
      raster: source,
      signal,
      onProgress: (percent) => {
        const inner = Math.max(0, Math.min(100, percent)) / 100
        emit(
          'segment',
          SEGMENT_INNER_START + inner * (SEGMENT_END - SEGMENT_INNER_START),
          'فصل العناصر عن الخلفية…',
        )
      },
    })
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) return cancelled()
    return fail('segment', errorMessage(error, 'فشل محرك الفصل في تحليل الصورة.'))
  }
  if (signal?.aborted) return cancelled()

  const maskPixels = output.width * output.height
  if (!(output.width > 0) || !(output.height > 0) || output.foreground.length !== maskPixels) {
    return fail('segment', 'أعاد محرك الفصل قناعاً بأبعاد غير صالحة.')
  }
  const foreground: PixelMask =
    output.width === source.width && output.height === source.height
      ? output.foreground
      : resizeMask(output.foreground, output.width, output.height, source.width, source.height)
  if (foreground.length !== source.width * source.height) {
    return fail('segment', 'أعاد محرك الفصل قناعاً بأبعاد غير صالحة.')
  }
  /** The masks are neural only when the provider and its own output both say so. */
  const neural = provider.neural && output.neural
  if (provider.neural && !output.neural) {
    // The provider advertised a model but its own output says no model ran: report the fallback.
    pushWarning(warnings, {
      code: 'classical-fallback',
      message: 'تعذّر تشغيل النموذج العصبي أثناء الفصل؛ تم استخدام التحليل الكلاسيكي لهذه الصورة.',
    })
  }
  emit('segment', SEGMENT_END, 'تم فصل العناصر عن الخلفية.')

  /* ── 4. classify ───────────────────────────────────────────────────────── */
  stage = 'classify'
  emit('classify', CLASSIFY_START, 'تنظيف القناع وتحديد المناطق المنفصلة…')
  let cleaned: PixelMask
  try {
    cleaned = fillHoles(
      openMask(foreground, source.width, source.height, FOREGROUND_OPEN_RADIUS),
      source.width,
      source.height,
    )
  } catch (error) {
    return fail('classify', errorMessage(error, 'تعذّر تنظيف قناع العناصر.'))
  }
  if (signal?.aborted) return cancelled()

  const minAreaFraction = options?.minAreaFraction ?? DEFAULT_MIN_AREA_FRACTION
  const minPixels = Math.max(4, Math.round(minAreaFraction * source.width * source.height))
  const maxLayers = Math.max(1, Math.floor(options?.maxLayers ?? DEFAULT_MAX_LAYERS))
  emit('classify', CLASSIFY_START + 7, 'تقسيم العناصر إلى مناطق منفصلة…')

  let regions: SegmentedRegion[]
  try {
    regions = decomposeRegions(source, cleaned, {
      minPixels,
      maxRegions: MAX_REGIONS_HARD_CEILING,
      colorTolerance: DEFAULT_COLOR_TOLERANCE,
    })
  } catch (error) {
    return fail('classify', errorMessage(error, 'تعذّر تقسيم الصورة إلى عناصر.'))
  }
  if (signal?.aborted) return cancelled()

  const { kept, truncated } = planRegions(regions, maxLayers)
  if (truncated > 0) {
    warnings.push({
      code: 'truncated-layers',
      message: `تم استخراج أكبر ${kept.length} عنصراً من أصل ${kept.length + truncated}؛ ارفع الحد الأقصى للطبقات لاستخراج الباقي.`,
    })
  }
  emit('classify', CLASSIFY_END, `تم تحديد ${kept.length} عنصراً قابلاً للفصل.`)

  if (kept.length === 0) {
    pushWarning(warnings, {
      code: 'no-elements',
      message: 'لم يتم العثور على عناصر قابلة للفصل في هذه الصورة.',
    })
    emit('extract', CLASSIFY_END, 'لم يتم العثور على عناصر قابلة للفصل.')
    return fail('extract', 'لم يتم العثور على عناصر قابلة للفصل في هذه الصورة.')
  }

  /* ── 5. extract ────────────────────────────────────────────────────────── */
  stage = 'extract'
  emit('extract', 60, 'استخراج العناصر كطبقات…')

  const detectText = options?.detectText !== false
  const ocr = detectText ? await resolveOcrProvider(options?.providers?.ocr) : null
  if (signal?.aborted) return cancelled()

  const layers: ExtractedLayer[] = []
  const fullRasters: Raster[] = []
  let union: PixelMask = new Uint8Array(source.width * source.height)

  for (let index = 0; index < kept.length; index++) {
    if (signal?.aborted) return cancelled()
    const region = kept[index]
    const bounds = clampBounds(region.bounds, source.width, source.height)

    const croppedRaster = cutElement(source, region.mask, bounds)
    const fullRaster = fullCanvasLayer(source, region.mask, bounds)
    const alphaMask = cropMask(region.mask, source.width, bounds)

    let croppedDataUrl: string
    let fullCanvasDataUrl: string
    let alphaMaskDataUrl: string
    try {
      croppedDataUrl = await encodeRaster(croppedRaster)
      fullCanvasDataUrl = await encodeRaster(fullRaster)
      alphaMaskDataUrl = await encodeMask(alphaMask, bounds.width, bounds.height)
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) return cancelled()
      return fail('extract', errorMessage(error, 'تعذّر ترميز إحدى الطبقات المستخرجة.'))
    }
    if (signal?.aborted) return cancelled()

    let classified: ReturnType<typeof classifyStage>
    try {
      classified = classifyStage(region, source, background)
    } catch (error) {
      return fail('classify', errorMessage(error, 'تعذّر تصنيف أحد العناصر.'))
    }

    const isText = detectText && (classified.layerClass === 'text' || classified.textCandidate)
    const fontSize = estimateFontSize(bounds)
    let text: TextLayerData | undefined
    if (isText) {
      if (ocr) {
        try {
          const recognised = await ocr.recognise(croppedDataUrl, signal)
          text = {
            content: recognised.text,
            fontFamily: RASTER_FONT_SUBSTITUTE,
            fontSize,
            color: rgbToHex(region.meanColor),
            align: 'center',
            direction: 'rtl',
            recognised: true,
            engine: recognised.engine,
          }
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) return cancelled()
          text = unrecognisedText(region.meanColor, fontSize)
          pushWarning(warnings, ocrUnavailableWarning())
        }
      } else {
        text = unrecognisedText(region.meanColor, fontSize)
        pushWarning(warnings, ocrUnavailableWarning())
      }
      if (signal?.aborted) return cancelled()
    }

    const confidence = Math.min(region.confidence, classified.confidence)
    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      pushWarning(warnings, {
        code: 'low-confidence',
        message: 'بعض العناصر المستخرجة بثقة منخفضة؛ يُنصح بمراجعتها قبل الاعتماد عليها.',
      })
    }

    layers.push({
      id: layerId(index),
      name: `${CLASS_LABEL_AR[classified.layerClass]} ${index + 1}`,
      layerClass: classified.layerClass,
      croppedDataUrl,
      fullCanvasDataUrl,
      alphaMaskDataUrl,
      bounds,
      page: mapBoundsToPage(bounds, source.width, source.height, input.pageWidth, input.pageHeight),
      rotation: 0,
      opacity: 1,
      zIndex: index,
      confidence,
      extractionMethod: neural ? 'model-segmentation' : 'classical-segmentation',
      ...(text ? { text } : {}),
      source: { url: input.imageUrl, width: input.width, height: input.height },
      editableProperties: {
        movable: true,
        resizable: true,
        removable: true,
        textEditable: text?.recognised === true,
      },
    })

    fullRasters.push(fullRaster)
    union = unionMask(union, region.mask)

    emit(
      'extract',
      60 + ((index + 1) / kept.length) * (EXTRACT_END - 60),
      `استخراج العنصر ${index + 1} من ${kept.length}…`,
    )
  }

  /* ── 6. reconstruct-background (optional) ──────────────────────────────── */
  let reconstructedRaster: Raster | null = null
  let reconstructedDataUrl: string | null = null
  let backgroundMethod: string | null = null

  if (options?.reconstructBackground !== false) {
    stage = 'reconstruct-background'
    emit('reconstruct-background', RECONSTRUCT_START, 'إعادة بناء الخلفية بعد إزالة العناصر…')

    let inpaintProvider: InpaintProvider | null = null
    try {
      inpaintProvider = await resolveInpaintProvider(options?.providers?.inpaint)
    } catch {
      inpaintProvider = null
    }
    if (signal?.aborted) return cancelled()

    if (!inpaintProvider) {
      pushWarning(warnings, {
        code: 'inpaint-classical',
        message: 'تعذّر تجهيز محرك إعادة بناء الخلفية؛ سيتم استخدام الصورة الأصلية كخلفية.',
      })
    } else {
      if (!inpaintProvider.neural) {
        pushWarning(warnings, {
          code: 'inpaint-classical',
          message: 'إعادة بناء الخلفية تتم بطريقة كلاسيكية (بدون نموذج عصبي).',
        })
      }
      // Grow the union by ~2 px first: healing exactly the element edge always leaves a halo.
      const holes = dilate(union, source.width, source.height, BACKGROUND_DILATE_RADIUS)
      try {
        const healed = await inpaintProvider.inpaint(source, holes)
        reconstructedDataUrl = await encodeRaster(healed)
        reconstructedRaster = healed
        backgroundMethod = inpaintProvider.id
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) return cancelled()
        // Honest degradation: the run continues with the untouched original as the background.
        pushWarning(warnings, {
          code: 'inpaint-classical',
          message: 'تعذّرت إعادة بناء الخلفية؛ سيتم استخدام الصورة الأصلية كخلفية.',
        })
      }
    }
    if (signal?.aborted) return cancelled()
    emit(
      'reconstruct-background',
      RECONSTRUCT_END,
      reconstructedDataUrl
        ? 'تمت إعادة بناء الخلفية.'
        : 'لم تتم إعادة بناء الخلفية؛ ستبقى الصورة الأصلية خلفيةً.',
    )
  }

  /* ── 7. compose ────────────────────────────────────────────────────────── */
  stage = 'compose'
  emit('compose', COMPOSE_START, 'تركيب الطبقات لمعاينة النتيجة…')
  const backgroundRaster: Raster =
    options?.reconstructBackground === false || !reconstructedRaster ? source : reconstructedRaster

  let compositeDataUrl: string
  try {
    compositeDataUrl = await compose([backgroundRaster, ...fullRasters])
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) return cancelled()
    return fail('compose', errorMessage(error, 'تعذّر تركيب صورة المعاينة.'))
  }
  if (signal?.aborted) return cancelled()
  emit('compose', COMPOSE_END, 'تم تركيب صورة المعاينة.')

  /* ── 8. ready ──────────────────────────────────────────────────────────── */
  stage = 'ready'
  emit('ready', 100, 'اكتمل تفكيك التصميم.')

  return assembleResult({
    input,
    layers,
    originalDataUrl: input.imageUrl,
    reconstructedDataUrl,
    backgroundMethod,
    compositeDataUrl,
    warnings,
    segmentationProviderId: provider.id,
    neural,
    durationMs: Math.max(0, Math.round(now() - started)),
  })
}
