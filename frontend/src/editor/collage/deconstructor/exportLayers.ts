/**
 * Design Decomposer — layer export.
 *
 * Turns a finished `PipelineResult` into real files: one PNG per layer, an optional healed
 * background and an optional machine-readable manifest. Nothing here touches a canvas — the
 * pipeline already encoded every image as a data URL — so this module is pure string/JSON work
 * and runs (and is tested) without OffscreenCanvas.
 */
import type {
  ExtractedLayer,
  LayerExportOptions,
  LayerManifest,
  PipelineResult,
} from './types'

/** One file ready to be written or downloaded. */
export interface ExportedFile {
  name: string
  dataUrl: string
}

export interface LayerExportBundle {
  files: ExportedFile[]
  manifest: LayerManifest | null
}

/** File name of the background image when it is exported. */
export const BACKGROUND_FILE_NAME = 'background.png'

/** File name of the manifest when it is exported. */
export const MANIFEST_FILE_NAME = 'layers.json'

/** Longest slug we keep from a layer name; keeps file names readable and path-length safe. */
const MAX_SLUG_LENGTH = 48

/**
 * Filesystem-safe slug for a layer name.
 *
 * Unicode letters and digits are preserved (names are Arabic in practice, and stripping them
 * would collapse every layer to the same fallback name); everything else — path separators,
 * control characters, dots, quotes — becomes a single dash.
 */
export function safeFileName(name: string): string {
  const slug = name
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length === 0) return 'layer'
  return slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '') || 'layer'
}

/** Zero-padded, 1-based index (`01`, `02`, …) sized to the export's widest index. */
export function layerIndexPrefix(index: number, total: number): string {
  const width = Math.max(2, String(Math.max(1, total)).length)
  return String(Math.max(0, index) + 1).padStart(width, '0')
}

/** Base64 of a UTF-8 string, chunked so long manifests never blow the argument limit. */
function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const CHUNK = 0x8000
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const slice = bytes.subarray(offset, offset + CHUNK)
    for (let i = 0; i < slice.length; i++) binary += String.fromCharCode(slice[i])
  }
  return btoa(binary)
}

/** `data:application/json;base64,<pretty json>` — the manifest travels as a real file. */
function jsonToDataUrl(value: unknown): string {
  return `data:application/json;base64,${utf8ToBase64(JSON.stringify(value, null, 2))}`
}

/** Decodes a data URL into a Blob without `fetch` (works for blob/http environments alike). */
function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl)
  if (!match) throw new Error('صيغة الملف غير صالحة: يجب أن يكون data URL.')
  const mime = match[1] || 'application/octet-stream'
  const payload = match[3]
  if (match[2] === ';base64') {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(payload)], { type: mime })
}

/**
 * Builds the export bundle.
 *
 * Layers are written back-to-front (`zIndex` ascending) so the file order matches the stacking
 * order the user sees. The background is a single `background.png`: the reconstructed image when
 * the pipeline produced one, otherwise the untouched original.
 */
export async function exportLayers(
  result: PipelineResult,
  options: LayerExportOptions,
): Promise<LayerExportBundle> {
  const ordered: ExtractedLayer[] = [...result.layers].sort((a, b) => a.zIndex - b.zIndex)
  const files: ExportedFile[] = []
  const manifestLayers: LayerManifest['layers'] = []

  for (let index = 0; index < ordered.length; index++) {
    const layer = ordered[index]
    const file = `layer-${layerIndexPrefix(index, ordered.length)}-${safeFileName(layer.name)}.png`
    const dataUrl = options.mode === 'full-canvas' ? layer.fullCanvasDataUrl : layer.croppedDataUrl
    files.push({ name: file, dataUrl })
    manifestLayers.push({
      id: layer.id,
      name: layer.name,
      layerClass: layer.layerClass,
      file,
      bounds: { ...layer.bounds },
      zIndex: layer.zIndex,
      rotation: layer.rotation,
      opacity: layer.opacity,
      confidence: layer.confidence,
      extractionMethod: layer.extractionMethod,
      text: layer.text ? { ...layer.text } : null,
    })
  }

  const reconstructedDataUrl = result.background.reconstructedDataUrl
  let backgroundFile: string | null = null
  let reconstructedFile: string | null = null
  let backgroundMethod: string | null = null

  if (options.includeBackground) {
    files.push({
      name: BACKGROUND_FILE_NAME,
      dataUrl: reconstructedDataUrl ?? result.background.originalDataUrl,
    })
    backgroundFile = BACKGROUND_FILE_NAME
    if (reconstructedDataUrl) {
      // The exported `background.png` *is* the reconstructed image; the manifest says so honestly.
      reconstructedFile = BACKGROUND_FILE_NAME
      backgroundMethod = result.background.method
    }
  }

  let manifest: LayerManifest | null = null
  if (options.includeManifest) {
    manifest = {
      version: 1,
      source: {
        width: result.input.width,
        height: result.input.height,
        imageUrl: result.input.imageUrl,
      },
      page: { width: result.input.pageWidth, height: result.input.pageHeight },
      segmentation: {
        providerId: result.segmentationProviderId,
        neural: result.neural,
      },
      layers: manifestLayers,
      background: {
        file: backgroundFile,
        reconstructedFile,
        method: backgroundMethod,
      },
    }
    files.push({ name: MANIFEST_FILE_NAME, dataUrl: jsonToDataUrl(manifest) })
  }

  return { files, manifest }
}

/**
 * Triggers a real browser download per file (anchor + object URL), then releases the object URLs
 * on the next macrotask so every download has time to start.
 */
export async function downloadFiles(files: readonly ExportedFile[]): Promise<void> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('تنزيل الملفات غير متاح في هذه البيئة.')
  }
  const objectUrls: string[] = []
  try {
    for (const file of files) {
      const href = URL.createObjectURL(dataUrlToBlob(file.dataUrl))
      objectUrls.push(href)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = file.name
      anchor.rel = 'noopener'
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    }
  } catch (error) {
    for (const url of objectUrls) URL.revokeObjectURL(url)
    throw error
  }
  const pending = objectUrls
  setTimeout(() => {
    for (const url of pending) URL.revokeObjectURL(url)
  }, 0)
}
