import { describe, expect, test, vi } from 'vitest'
import {
  BACKGROUND_FILE_NAME,
  MANIFEST_FILE_NAME,
  downloadFiles,
  exportLayers,
  layerIndexPrefix,
  safeFileName,
} from './exportLayers'
import type { ExtractedLayer, LayerManifest, PipelineResult } from './types'

/** Decodes a `data:*;base64,…` URL back to text, UTF-8 safe (layer names are Arabic). */
function dataUrlToText(dataUrl: string): string {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function layer(index: number, overrides: Partial<ExtractedLayer> = {}): ExtractedLayer {
  return {
    id: `layer-${index}`,
    name: `Layer ${index}`,
    layerClass: 'decoration',
    croppedDataUrl: `data:image/png;base64,CROPPED_${index}`,
    fullCanvasDataUrl: `data:image/png;base64,FULL_${index}`,
    alphaMaskDataUrl: `data:image/png;base64,MASK_${index}`,
    bounds: { x: index, y: index * 2, width: 10, height: 20 },
    page: { x: index * 2, y: index * 4, width: 20, height: 40 },
    rotation: 0,
    opacity: 1,
    zIndex: index,
    confidence: 0.75,
    extractionMethod: 'classical-segmentation',
    source: { url: 'data:image/png;base64,SOURCE', width: 400, height: 200 },
    editableProperties: { movable: true, resizable: true, removable: true, textEditable: false },
    ...overrides,
  }
}

function readyResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    status: 'ready',
    input: {
      imageUrl: 'data:image/png;base64,SOURCE',
      width: 400,
      height: 200,
      pageWidth: 800,
      pageHeight: 400,
    },
    originalDataUrl: 'data:image/png;base64,SOURCE',
    layers: [layer(0, { name: 'Flower' }), layer(1, { name: 'Bow' })],
    background: {
      originalDataUrl: 'data:image/png;base64,ORIGINAL',
      reconstructedDataUrl: 'data:image/png;base64,HEALED',
      method: 'exemplar-inpaint',
    },
    compositeDataUrl: 'data:image/png;base64,COMPOSITE',
    warnings: [],
    segmentationProviderId: 'classical-regions',
    neural: false,
    durationMs: 42,
    ...overrides,
  }
}

describe('safeFileName', () => {
  test('slugs spaces, slashes, dots and control characters', () => {
    expect(safeFileName('Flower / Bow.png')).toBe('flower-bow-png')
    expect(safeFileName('  ..\\Weird//Name..  ')).toBe('weird-name')
    expect(safeFileName('a\u0000b\u001fc')).toBe('a-b-c')
  })

  test('keeps unicode letters so Arabic names do not collapse', () => {
    expect(safeFileName('زخرفة ١')).toBe('زخرفة-١')
  })

  test('falls back to "layer" when nothing survives', () => {
    expect(safeFileName('')).toBe('layer')
    expect(safeFileName('***')).toBe('layer')
  })
})

describe('layerIndexPrefix', () => {
  test('pads to at least two digits and widens for large exports', () => {
    expect(layerIndexPrefix(0, 2)).toBe('01')
    expect(layerIndexPrefix(9, 12)).toBe('10')
    expect(layerIndexPrefix(11, 120)).toBe('012')
  })
})

describe('exportLayers — mode and file names', () => {
  test('cropped mode writes one cropped PNG per layer plus background and manifest', async () => {
    const { files, manifest } = await exportLayers(readyResult(), {
      mode: 'cropped',
      includeBackground: true,
      includeManifest: true,
    })
    expect(files.map((file) => file.name)).toEqual([
      'layer-01-flower.png',
      'layer-02-bow.png',
      BACKGROUND_FILE_NAME,
      MANIFEST_FILE_NAME,
    ])
    expect(files[0].dataUrl).toBe('data:image/png;base64,CROPPED_0')
    expect(files[1].dataUrl).toBe('data:image/png;base64,CROPPED_1')
    expect(manifest).not.toBeNull()
  })

  test('full-canvas mode uses the full-canvas PNG per layer', async () => {
    const { files } = await exportLayers(readyResult(), {
      mode: 'full-canvas',
      includeBackground: false,
      includeManifest: false,
    })
    expect(files.map((file) => file.name)).toEqual(['layer-01-flower.png', 'layer-02-bow.png'])
    expect(files[0].dataUrl).toBe('data:image/png;base64,FULL_0')
    expect(files[1].dataUrl).toBe('data:image/png;base64,FULL_1')
  })

  test('exports back-to-front: files follow zIndex ascending, not array order', async () => {
    const result = readyResult({
      layers: [
        layer(0, { name: 'top', zIndex: 2, croppedDataUrl: 'data:image/png;base64,TOP' }),
        layer(1, { name: 'bottom', zIndex: 0, croppedDataUrl: 'data:image/png;base64,BOTTOM' }),
        layer(2, { name: 'middle', zIndex: 1, croppedDataUrl: 'data:image/png;base64,MIDDLE' }),
      ],
    })
    const { files, manifest } = await exportLayers(result, {
      mode: 'cropped',
      includeBackground: false,
      includeManifest: true,
    })
    expect(files.map((file) => file.name)).toEqual([
      'layer-01-bottom.png',
      'layer-02-middle.png',
      'layer-03-top.png',
      MANIFEST_FILE_NAME,
    ])
    expect(files.map((file) => file.dataUrl).slice(0, 3)).toEqual([
      'data:image/png;base64,BOTTOM',
      'data:image/png;base64,MIDDLE',
      'data:image/png;base64,TOP',
    ])
    expect(manifest?.layers.map((entry) => entry.zIndex)).toEqual([0, 1, 2])
  })

  test('widens the index padding for exports above nine layers', async () => {
    const layers = Array.from({ length: 12 }, (_, index) => layer(index))
    const { files } = await exportLayers(readyResult({ layers }), {
      mode: 'cropped',
      includeBackground: false,
      includeManifest: false,
    })
    expect(files).toHaveLength(12)
    expect(files[0].name).toBe('layer-01-layer-0.png')
    expect(files[8].name).toBe('layer-09-layer-8.png')
    expect(files[9].name).toBe('layer-10-layer-9.png')
    expect(files[11].name).toBe('layer-12-layer-11.png')
  })
})

describe('exportLayers — background', () => {
  test('writes the reconstructed background when the pipeline produced one', async () => {
    const { files, manifest } = await exportLayers(readyResult(), {
      mode: 'cropped',
      includeBackground: true,
      includeManifest: true,
    })
    const background = files.find((file) => file.name === BACKGROUND_FILE_NAME)
    expect(background?.dataUrl).toBe('data:image/png;base64,HEALED')
    expect(manifest?.background).toEqual({
      file: BACKGROUND_FILE_NAME,
      reconstructedFile: BACKGROUND_FILE_NAME,
      method: 'exemplar-inpaint',
    })
  })

  test('falls back to the original image and reports no reconstruction honestly', async () => {
    const result = readyResult({
      background: {
        originalDataUrl: 'data:image/png;base64,ORIGINAL',
        reconstructedDataUrl: null,
        method: null,
      },
    })
    const { files, manifest } = await exportLayers(result, {
      mode: 'cropped',
      includeBackground: true,
      includeManifest: true,
    })
    expect(files.find((file) => file.name === BACKGROUND_FILE_NAME)?.dataUrl).toBe(
      'data:image/png;base64,ORIGINAL',
    )
    expect(manifest?.background).toEqual({
      file: BACKGROUND_FILE_NAME,
      reconstructedFile: null,
      method: null,
    })
  })

  test('omits the background entirely when not requested', async () => {
    const { files, manifest } = await exportLayers(readyResult(), {
      mode: 'cropped',
      includeBackground: false,
      includeManifest: true,
    })
    expect(files.some((file) => file.name === BACKGROUND_FILE_NAME)).toBe(false)
    expect(manifest?.background.file).toBeNull()
    expect(manifest?.background.reconstructedFile).toBeNull()
    expect(manifest?.background.method).toBeNull()
  })
})

describe('exportLayers — manifest', () => {
  test('layers.json round-trips as UTF-8 pretty JSON with every frozen field', async () => {
    const textLayerData = {
      content: 'عيد ميلاد سعيد',
      fontFamily: 'Cairo',
      fontSize: 24,
      color: '#334155',
      align: 'center' as const,
      direction: 'rtl' as const,
      recognised: true,
      engine: 'stub-ocr',
    }
    const result = readyResult({
      layers: [
        layer(0, { name: 'Flower', layerClass: 'decoration', zIndex: 0, confidence: 0.9 }),
        layer(1, { name: 'نص', layerClass: 'text', zIndex: 1, text: textLayerData }),
      ],
      neural: true,
      segmentationProviderId: 'u2netp',
    })
    const { files, manifest } = await exportLayers(result, {
      mode: 'full-canvas',
      includeBackground: true,
      includeManifest: true,
    })

    const manifestFile = files.find((file) => file.name === MANIFEST_FILE_NAME)
    expect(manifestFile).toBeDefined()
    expect(manifestFile?.dataUrl.startsWith('data:application/json;base64,')).toBe(true)
    const parsed = JSON.parse(dataUrlToText(manifestFile!.dataUrl)) as LayerManifest

    expect(parsed.version).toBe(1)
    expect(parsed.source).toEqual({
      width: 400,
      height: 200,
      imageUrl: 'data:image/png;base64,SOURCE',
    })
    expect(parsed.page).toEqual({ width: 800, height: 400 })
    expect(parsed.segmentation).toEqual({ providerId: 'u2netp', neural: true })
    expect(parsed.layers).toHaveLength(2)

    const [first, second] = parsed.layers
    expect(first).toEqual({
      id: 'layer-0',
      name: 'Flower',
      layerClass: 'decoration',
      file: 'layer-01-flower.png',
      bounds: { x: 0, y: 0, width: 10, height: 20 },
      zIndex: 0,
      rotation: 0,
      opacity: 1,
      confidence: 0.9,
      extractionMethod: 'classical-segmentation',
      text: null,
    })
    expect(second.file).toBe('layer-02-نص.png')
    expect(second.text).toEqual(textLayerData)
    expect(second.text?.content).toBe('عيد ميلاد سعيد')
    expect(parsed.background.method).toBe('exemplar-inpaint')

    // manifest is byte-identical to the returned object
    expect(parsed).toEqual(manifest)
    // every manifest file name exists in the real export bundle
    const exported = new Set(files.map((file) => file.name))
    for (const entry of parsed.layers) expect(exported.has(entry.file)).toBe(true)
  })

  test('skips the manifest when not requested', async () => {
    const { files, manifest } = await exportLayers(readyResult(), {
      mode: 'cropped',
      includeBackground: true,
      includeManifest: false,
    })
    expect(manifest).toBeNull()
    expect(files.some((file) => file.name === MANIFEST_FILE_NAME)).toBe(false)
  })
})

describe('downloadFiles', () => {
  test('performs a real download per file and revokes every object URL', async () => {
    const createdTypes: string[] = []
    const revoked: string[] = []
    const clicked: string[] = []
    const realCreate = URL.createObjectURL
    const realRevoke = URL.revokeObjectURL
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: (blob: Blob) => {
        createdTypes.push(blob.type)
        return `blob:mock/${createdTypes.length}`
      },
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: (url: string) => {
        revoked.push(url)
      },
    })
    const clickSpy = vi
      .spyOn(HTMLElement.prototype, 'click')
      .mockImplementation(function (this: HTMLElement) {
        clicked.push((this as HTMLAnchorElement).download)
      })

    try {
      await downloadFiles([
        { name: 'layer-01-flower.png', dataUrl: 'data:image/png;base64,AAAA' },
        { name: MANIFEST_FILE_NAME, dataUrl: 'data:application/json;base64,e30=' },
      ])
      expect(clicked).toEqual(['layer-01-flower.png', MANIFEST_FILE_NAME])
      expect(createdTypes).toEqual(['image/png', 'application/json'])
      expect(document.querySelectorAll('a[download]')).toHaveLength(0)
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(revoked).toEqual(['blob:mock/1', 'blob:mock/2'])
    } finally {
      clickSpy.mockRestore()
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: realCreate,
      })
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: realRevoke,
      })
    }
  })
})
