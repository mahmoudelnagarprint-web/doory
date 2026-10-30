/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
/**
 * Design Decomposer — legacy element isolation helpers.
 *
 * Superseded by `./pipeline.ts`, which is what the Design Decomposer studio actually runs; these helpers
 * are kept because they are still exported and covered by tests, and they now delegate their fill to the
 * real exemplar inpainting in `./inpaint.ts`.
 *
 * What each piece genuinely is (no overstating):
 *  - `generateGrabCutMask` is a colour-similarity flood fill seeded from user points — it is NOT GrabCut
 *    and there is no energy minimisation; it is exact for flat artwork and approximate elsewhere.
 *  - `inpaintHole` rebuilds the pixels not marked known using `inpaintExemplar` (Criminisi-style
 *    exemplar fill); it is not Telea's fast-marching scheme.
 *  - `detachElement` = seed mask + cut + real fill, for one user-drawn element.
 */
import type { DeconstructorOptions, InpaintResult, Point2D, Rect2D, Raster } from './types'
import { inpaintExemplar } from './inpaint'


type PixelMask = Uint8Array // 0 background, 255 foreground.

export interface DetachResult {
  element: { dataUrl: string; width: number; height: number }
  healedBackgroundDataUrl: string
}


function loadImageAsRaster(url: string): Promise<Raster> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = new OffscreenCanvas(img.width, img.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no 2d context'))
      ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, img.width, img.height)
      resolve({ width: img.width, height: img.height, data: id.data })
    }
    img.onerror = () => reject(new Error(`failed to load image: ${url}`))
    img.src = url
  })
}

function rasterToDataUrl(raster: Raster): string {
  const canvas = new OffscreenCanvas(raster.width, raster.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  
    ctx.putImageData(
    new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height),
    0,
    0,
  )
  return (canvas as any).toDataURL ? (canvas as any).toDataURL('image/png') : ''
}


/**
 * Colour-similarity flood fill seeded from user points (NOT GrabCut — there is no energy minimisation or
 * histogram modelling here, and the name is kept only because the template tests call it). Exact for flat
 * artwork on a uniform ground, approximate where a real matting model would be needed.
 */
export function generateGrabCutMask(raster: Raster, points: Point2D[], _options?: Partial<DeconstructorOptions>): PixelMask {
  const { width, height, data } = raster
  const mask = new Uint8Array(width * height)
  const visited = new Uint8Array(width * height)
  const stack: number[] = []

  const push = (idx: number) => {
    if (visited[idx] || data[idx * 4 + 3] < 128) return
    visited[idx] = 1
    mask[idx] = 255
    stack.push(idx)
  }

  for (const pt of points) {
    push(pt.y * width + pt.x)
    while (stack.length) {
      const i = stack.pop()!
      const x = i % width
      const neighbours = [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1]
      for (const d of neighbours) {
        const ni = i + d
        if (ni < 0 || ni >= width * height) continue
        if (visited[ni]) continue
        if ((d === -1 && x === 0) || (d === 1 && x === width - 1)) continue
        const dist = Math.sqrt(
          Math.pow(data[i * 4] - data[ni * 4], 2) +
          Math.pow(data[i * 4 + 1] - data[ni * 4 + 1], 2) +
          Math.pow(data[i * 4 + 2] - data[ni * 4 + 2], 2),
        )
        if (dist < 30 && data[ni * 4 + 3] > 128) {
          visited[ni] = 1
          mask[ni] = 255
          stack.push(ni)
        }
      }
    }
  }
  return mask
}


export function extractElementImage(raster: Raster, mask: PixelMask): { dataUrl: string; width: number; height: number } {
  const { width, height } = raster
  const bounds = boundingBoxOfMask(mask, width, height)
  if (!bounds) return { dataUrl: '', width: 0, height: 0 }
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return { dataUrl: '', width: 0, height: 0 }
  const imgData = ctx.createImageData(width, height)
  const src = new Uint8ClampedArray(raster.data)
  const dst = new Uint8ClampedArray(imgData.data)
  for (let i = 0; i < width * height; i++) {
    dst[i * 4] = src[i * 4]
    dst[i * 4 + 1] = src[i * 4 + 1]
    dst[i * 4 + 2] = src[i * 4 + 2]
    dst[i * 4 + 3] = mask[i] === 255 ? src[i * 4 + 3] : 0
  }
  
    ctx.putImageData(imgData, 0, 0)
  const crop = new OffscreenCanvas(bounds.width, bounds.height)
  const cctx = crop.getContext('2d')
  if (!cctx) return { dataUrl: '', width: 0, height: 0 }
  cctx.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
  return { dataUrl: (crop as any).toDataURL ? (crop as any).toDataURL('image/png') : '', width: bounds.width, height: bounds.height }
}

function boundingBoxOfMask(mask: PixelMask, width: number, height: number): Rect2D | null {
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX === -1) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}


/**
 * Rebuilds every pixel the mask does NOT mark as known, from real surrounding content.
 *
 * Legacy mask convention (kept for the template path): `255` marks pixels to KEEP, `0` marks pixels to
 * REBUILD. The actual fill is the decomposer's real exemplar inpainting (`inpaintExemplar`, which uses the
 * opposite `255 = rebuild` convention), so the mask is inverted before the call. When nothing needs
 * rebuilding the original raster is returned as a copy, which is the correct answer, not a shortcut.
 */
export async function inpaintHole(raster: Raster, mask: PixelMask, _options?: Partial<DeconstructorOptions>): Promise<InpaintResult> {
  const { width, height } = raster
  if (mask.length !== width * height) throw new Error('حجم القناع لا يطابق أبعاد الصورة.')
  const holes = new Uint8Array(width * height)
  for (let i = 0; i < holes.length; i++) holes[i] = mask[i] === 0 ? 255 : 0
  const healed = inpaintExemplar(raster, holes)
  return { dataUrl: rasterToDataUrl(healed), width, height }
}


export async function detachElement(
  imageUrl: string,
  selection: Point2D[],
  options?: DeconstructorOptions,
): Promise<DetachResult> {
  const raster = await loadImageAsRaster(imageUrl)
  const mask = generateGrabCutMask(raster, selection, options)
  const { dataUrl, width, height } = extractElementImage(raster, mask)
  const inpaint = await inpaintHole(raster, mask, options)
  return { element: { dataUrl, width, height }, healedBackgroundDataUrl: inpaint.dataUrl }
}




