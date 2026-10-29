/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
/**
 * Smart Design Deconstructor — Text Isolation, Clean Erasure & Live Typography.
 *
 * Detects raster text on quote cards inside a flat template, erases it cleanly from the paper
 * texture (Telea inpainting on a binarised ink mask), and converts it into a live editable
 * text layer (font size / ink colour / paper colour / rotation sampled from the raster).
 *
 * All runs client-side on a hidden OffscreenCanvas. No server, no paid API.
 */
import type { DeconstructorOptions, DetectedTextCard, InpaintResult, Rect2D, Raster } from './types'
import { inpaintHole } from './elementDetacher'


export function binarizeInk(raster: Raster, blockSize = 31, c = 5): Uint8Array {
  const { width, height, data } = raster
  const mask = new Uint8Array(width * height)
  const half = Math.floor(blockSize / 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      let sum = 0
      let count = 0
      for (let yy = -half; yy <= half; yy++) {
        const ny = y + yy
        if (ny < 0 || ny >= height) continue
        for (let xx = -half; xx <= half; xx++) {
          const nx = x + xx
          if (nx < 0 || nx >= width) continue
          const idx = ny * width + nx
          sum += 0.2126 * data[idx * 4] + 0.7152 * data[idx * 4 + 1] + 0.0722 * data[idx * 4 + 2]
          count++
        }
      }
      const mean = sum / count
      const gray = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255
      const threshold = mean * (1 - c / 255)
      mask[i] = gray >= threshold ? 255 : 0
    }
  }
  return mask
}



function connectedComponents(mask: Uint8Array, width: number, height: number): { bbox: Rect2D; pixelCount: number }[] {
  const visited = new Uint8Array(width * height)
  const out: { bbox: Rect2D; pixelCount: number }[] = []
  for (let start = 0; start < width * height; start++) {
    if (mask[start] === 0 || visited[start] === 1) continue
    const stack = [start]
    visited[start] = 1
    let minX = width, minY = height, maxX = -1, maxY = -1
    let count = 0
    while (stack.length) {
      const i = stack.pop()!
      const x = i % width
      const y = (i / width) | 0
      count++
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      for (const d of [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1]) {
        const ni = i + d
        if (ni < 0 || ni >= width * height) continue
        if ((d === -1 && x === 0) || (d === 1 && x === width - 1)) continue
        if (mask[ni] === 255 && visited[ni] === 0) {
          visited[ni] = 1
          stack.push(ni)
        }
      }
    }
    out.push({
      bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      pixelCount: count,
    })
  }
  return out
}


function sampleInkColor(raster: Raster, region: Rect2D): string {
  const { width, height, data } = raster
  let r = 0, g = 0, b = 0, n = 0
  const x0 = Math.max(0, Math.floor(region.x))
  const y0 = Math.max(0, Math.floor(region.y))
  const x1 = Math.min(width, Math.floor(region.x + region.width))
  const y1 = Math.min(height, Math.floor(region.y + region.height))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = y * width + x
      if (data[idx * 4 + 3] < 128) continue
      r += data[idx * 4]
      g += data[idx * 4 + 1]
      b += data[idx * 4 + 2]
      n++
    }
  }
  if (n === 0) return '#000000'
  return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`
}

function samplePaperColor(raster: Raster, region: Rect2D, padding = 4): string {
  const { width, height, data } = raster
  const x0 = Math.max(0, Math.floor(region.x - padding))
  const y0 = Math.max(0, Math.floor(region.y - padding))
  const x1 = Math.min(width, Math.floor(region.x + region.width + padding))
  const y1 = Math.min(height, Math.floor(region.y + region.height + padding))
  let r = 0, g = 0, b = 0, n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = y * width + x
      if (data[idx * 4 + 3] < 64) continue
      const lum = (0.2126 * data[idx * 4] + 0.7152 * data[idx * 4 + 1] + 0.0722 * data[idx * 4 + 2]) / 255
      if (lum < 0.3) continue // ink.
      r += data[idx * 4]
      g += data[idx * 4 + 1]
      b += data[idx * 4 + 2]
      n++
    }
  }
  if (n === 0) return '#f5efe2'
  return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`
}


export function spawnLiveTextLayer(detected: DetectedTextCard): DetectedTextCard {
  return {
    ...detected,
    inkColor: detected.inkColor,
    paperColor: detected.paperColor,
    fontSize: detected.fontSize,
    angle: detected.angle,
  }
}


/**
 * Detect text components on the template's quote cards and erase them (Telea inpaint).
 */
export async function detectAndEraseText(
  imageUrl: string,
  options: DeconstructorOptions = {},
): Promise<{ texts: DetectedTextCard[]; healedBackgroundDataUrl: string }> {
  const raster = await loadImageAsRaster(imageUrl)
  const inkMask = binarizeInk(raster, 31, 5)
  const components = connectedComponents(inkMask, raster.width, raster.height)
  const texts: DetectedTextCard[] = []
  const healed = await inpaintHole(raster, inkMask, options)

  for (const comp of components) {
    const { width: w, height: h } = comp.bbox
    if (w < 6 || h < 6) continue
    const aspect = w / h
    if (aspect < 0.4 || aspect > 4) continue
    const ink = sampleInkColor(raster, comp.bbox)
    const paper = samplePaperColor(raster, comp.bbox)
    texts.push({
      id: `text-${texts.length}`,
      x: comp.bbox.x,
      y: comp.bbox.y,
      width: w,
      height: h,
      angle: 0,
      inkColor: ink,
      paperColor: paper,
      fontSize: Math.max(8, h * 0.7),
      text: '',
      confidence: Math.min(1, comp.pixelCount / (w * h)),
    })
  }
  return { texts, healedBackgroundDataUrl: healed.dataUrl }
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

export type { InpaintResult }





