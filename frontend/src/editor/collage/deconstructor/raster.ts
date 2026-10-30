/**
 * Design Decomposer — raster boundary.
 *
 * The only module in the decomposer that touches the DOM. Every core algorithm works on plain
 * `Raster` / `PixelMask` typed arrays; this file turns URLs into pixels, pixels into PNG data URLs,
 * crops, scales and composites. Keeping the boundary here is what lets the pipeline run (and be
 * tested) in a worker, on the main thread or in jsdom with no canvas present.
 */
import type { PixelRect, Raster } from './types'

/** Refuse to decompose anything above 24 megapixels: the masks are one byte per pixel. */
export const MAX_SOURCE_PIXELS = 24_000_000

/** Longest side a source is reduced to before analysis. Keeps every pass bounded and predictable. */
export const ANALYSIS_LONG_SIDE = 1600

/** A source decoded for analysis, with the size the user actually gave us. */
export interface DecodedSource extends Raster {
  /** Width of the original file in pixels. */
  originalWidth: number
  /** Height of the original file in pixels. */
  originalHeight: number
  /** Scale applied to get from the original to this analysis raster. */
  scale: number
}

export class DecomposeError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'decode-failed'
      | 'unsupported-type'
      | 'too-large'
      | 'no-canvas'
      | 'encode-failed',
  ) {
    super(message)
    this.name = 'DecomposeError'
  }
}

function canUseDom(): boolean {
  return typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined'
}

/** Creates a 2D drawing surface of exactly `width` x `height`, or throws a readable error. */
export function createSurface(width: number, height: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
} {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new DecomposeError('تعذّر إنشاء سياق الرسم (OffscreenCanvas).', 'no-canvas')
    return { canvas, ctx }
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new DecomposeError('تعذّر إنشاء سياق الرسم.', 'no-canvas')
    return { canvas, ctx }
  }
  throw new DecomposeError('لا يوجد سياق رسم متاح في هذه البيئة.', 'no-canvas')
}

/** Draws a surface to a PNG data URL (`OffscreenCanvas` has no reliable `toDataURL` everywhere). */
export async function surfaceToDataUrl(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<string> {
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return blobToDataUrl(blob)
  }
  const html = canvas as HTMLCanvasElement
  if (typeof html.toDataURL === 'function') return html.toDataURL('image/png')
  throw new DecomposeError('تعذّر ترميز الصورة.', 'encode-failed')
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new DecomposeError('تعذّر قراءة بيانات الصورة.', 'encode-failed'))
    reader.readAsDataURL(blob)
  })
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new DecomposeError('لا يوجد محمّل صور في هذه البيئة.', 'decode-failed'))
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new DecomposeError('تعذّر تحميل الصورة. تأكد من أنها صورة PNG أو JPG صالحة.', 'decode-failed'))
    img.src = url
  })
}

/**
 * Decodes `url` into an analysis raster reduced so its longer side is at most `maxLongSide`.
 * The original dimensions and the reduction factor travel with the result, so every layer can be
 * mapped back to true source pixels and the editor reads the truth about scale.
 */
export async function decodeSource(
  url: string,
  options: { maxLongSide?: number; signal?: AbortSignal } = {},
): Promise<DecodedSource> {
  if (!canUseDom()) throw new DecomposeError('لا يوجد سياق رسم متاح في هذه البيئة.', 'no-canvas')
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const img = await loadImageElement(url)
  const originalWidth = img.naturalWidth || img.width
  const originalHeight = img.naturalHeight || img.height
  if (originalWidth < 1 || originalHeight < 1) {
    throw new DecomposeError('أبعاد الصورة غير صالحة.', 'decode-failed')
  }
  if (originalWidth * originalHeight > MAX_SOURCE_PIXELS) {
    throw new DecomposeError(
      `الصورة أكبر من الحد المسموح (${Math.round(MAX_SOURCE_PIXELS / 1_000_000)} ميجابكسل).`,
      'too-large',
    )
  }
  const maxLongSide = options.maxLongSide ?? ANALYSIS_LONG_SIDE
  const scale = Math.min(1, maxLongSide / Math.max(originalWidth, originalHeight))
  const width = Math.max(1, Math.round(originalWidth * scale))
  const height = Math.max(1, Math.round(originalHeight * scale))
  const { ctx } = createSurface(width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  return {
    width,
    height,
    data: imageData.data,
    originalWidth,
    originalHeight,
    scale,
  }
}

/** Encodes a RGBA raster as a PNG data URL. */
export async function rasterToDataUrl(raster: Raster): Promise<string> {
  const { canvas, ctx } = createSurface(raster.width, raster.height)
  const image = ctx.createImageData(raster.width, raster.height)
  image.data.set(raster.data)
  ctx.putImageData(image, 0, 0)
  return surfaceToDataUrl(canvas)
}

/** Encodes a one-byte coverage mask as a grayscale PNG data URL (alpha channel = mask). */
export async function maskToDataUrl(mask: Uint8Array, width: number, height: number): Promise<string> {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const value = mask[i]
    rgba[i * 4] = value
    rgba[i * 4 + 1] = value
    rgba[i * 4 + 2] = value
    rgba[i * 4 + 3] = 255
  }
  return rasterToDataUrl({ width, height, data: rgba })
}

/** Copies a rectangle out of a raster. */
export function cropRaster(raster: Raster, rect: PixelRect): Raster {
  const x0 = Math.max(0, Math.min(raster.width, Math.round(rect.x)))
  const y0 = Math.max(0, Math.min(raster.height, Math.round(rect.y)))
  const x1 = Math.max(x0, Math.min(raster.width, Math.round(rect.x + rect.width)))
  const y1 = Math.max(y0, Math.min(raster.height, Math.round(rect.y + rect.height)))
  const width = Math.max(1, x1 - x0)
  const height = Math.max(1, y1 - y0)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcRow = ((y0 + y) * raster.width + x0) * 4
    const dstRow = y * width * 4
    data.set(raster.data.subarray(srcRow, srcRow + width * 4), dstRow)
  }
  return { width, height, data }
}

/** Draws rasters onto one surface in order (bottom first) and returns the PNG data URL. */
export async function composeRasters(layers: readonly Raster[]): Promise<string> {
  const width = Math.max(1, ...layers.map((layer) => layer.width))
  const height = Math.max(1, ...layers.map((layer) => layer.height))
  const { canvas, ctx } = createSurface(width, height)
  for (const layer of layers) {
    const { canvas: piece, ctx: pieceCtx } = createSurface(layer.width, layer.height)
    const image = pieceCtx.createImageData(layer.width, layer.height)
    image.data.set(layer.data)
    pieceCtx.putImageData(image, 0, 0)
    ctx.drawImage(piece as CanvasImageSource, 0, 0)
  }
  return surfaceToDataUrl(canvas)
}

/** Reads the pixel size of a data/blob URL without keeping the pixels. */
export async function imageSize(url: string): Promise<{ width: number; height: number }> {
  const img = await loadImageElement(url)
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height }
}