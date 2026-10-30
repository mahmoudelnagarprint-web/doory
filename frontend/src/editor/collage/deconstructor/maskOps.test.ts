import { describe, expect, test } from 'vitest'
import {
  bboxOf,
  binarize,
  closeMask,
  cutElement,
  dilate,
  erode,
  featherMask,
  fillHoles,
  grayscale,
  intersectMask,
  maskArea,
  openMask,
  resizeMask,
  subtractMask,
  unionMask,
} from './maskOps'
import type { PixelRect, Raster } from './types'

/** A binary mask with `255` inside `rect` (clipped to the mask). */
function rectMask(width: number, height: number, rect: PixelRect): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    if (y < 0 || y >= height) continue
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (x < 0 || x >= width) continue
      mask[y * width + x] = 255
    }
  }
  return mask
}

function solidRaster(width: number, height: number, r: number, g: number, b: number, a = 255): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return { width, height, data }
}

describe('binarize', () => {
  test('splits at the threshold inclusive of the threshold value', () => {
    const out = binarize(Uint8Array.from([0, 10, 127, 128, 200, 255]), 128)
    expect(Array.from(out)).toEqual([0, 0, 0, 255, 255, 255])
  })
})

describe('erode / dilate', () => {
  const width = 40
  const height = 40
  const mask = rectMask(width, height, { x: 10, y: 10, width: 20, height: 20 })

  test('erode shrinks the rectangle by the radius on every side', () => {
    const out = erode(mask, width, height, 2)
    expect(maskArea(out)).toBe(16 * 16)
    expect(bboxOf(out, width, height)).toEqual({ x: 12, y: 12, width: 16, height: 16 })
  })

  test('dilate grows the rectangle by the radius on every side', () => {
    const out = dilate(mask, width, height, 2)
    expect(maskArea(out)).toBe(24 * 24)
    expect(bboxOf(out, width, height)).toEqual({ x: 8, y: 8, width: 24, height: 24 })
  })

  test('radius 0 is a copy, never the same object', () => {
    const out = erode(mask, width, height, 0)
    expect(out).not.toBe(mask)
    expect(Array.from(out)).toEqual(Array.from(mask))
  })

  test('erosion of an empty mask stays empty', () => {
    expect(maskArea(erode(new Uint8Array(width * height), width, height, 2))).toBe(0)
  })
})

describe('openMask / closeMask', () => {
  const width = 40
  const height = 40

  test('opening removes an isolated speck and keeps the rectangle', () => {
    const mask = rectMask(width, height, { x: 10, y: 10, width: 20, height: 20 })
    mask[5 * width + 5] = 255
    const out = openMask(mask, width, height, 1)
    expect(out[5 * width + 5]).toBe(0)
    expect(maskArea(out)).toBe(400)
    expect(bboxOf(out, width, height)).toEqual({ x: 10, y: 10, width: 20, height: 20 })
  })

  test('closing bridges a one pixel gap between two blocks', () => {
    const mask = rectMask(width, height, { x: 10, y: 10, width: 10, height: 10 })
    const right = rectMask(width, height, { x: 21, y: 10, width: 10, height: 10 })
    for (let i = 0; i < mask.length; i++) if (right[i] > 0) mask[i] = 255
    expect(mask[15 * width + 20]).toBe(0)
    const out = closeMask(mask, width, height, 1)
    expect(out[15 * width + 20]).toBe(255)
    expect(maskArea(out)).toBe(21 * 10)
  })
})

describe('fillHoles', () => {
  const width = 30
  const height = 30

  test('fills an enclosed hole but never the outer background', () => {
    const mask = new Uint8Array(width * height)
    // A ring: the border of the 10..19 square, the inside stays background.
    for (let i = 10; i <= 19; i++) {
      mask[10 * width + i] = 255
      mask[19 * width + i] = 255
      mask[i * width + 10] = 255
      mask[i * width + 19] = 255
    }
    const out = fillHoles(mask, width, height)
    expect(out[14 * width + 14]).toBe(255)
    expect(maskArea(out)).toBe(100)
    expect(out[0]).toBe(0)
    expect(out[29 * width + 29]).toBe(0)
  })

  test('does not fill through a channel open to the outside', () => {
    const mask = new Uint8Array(width * height)
    for (let i = 10; i <= 19; i++) {
      mask[10 * width + i] = 255
      mask[19 * width + i] = 255
      mask[i * width + 10] = 255
      if (i > 14) mask[i * width + 19] = 255
    }
    const out = fillHoles(mask, width, height)
    expect(out[14 * width + 14]).toBe(0)
  })
})

describe('bboxOf / maskArea', () => {
  test('reports the exact box and null for an empty mask', () => {
    const mask = rectMask(20, 12, { x: 3, y: 4, width: 5, height: 6 })
    expect(bboxOf(mask, 20, 12)).toEqual({ x: 3, y: 4, width: 5, height: 6 })
    expect(maskArea(mask)).toBe(30)
    expect(bboxOf(new Uint8Array(20 * 12), 20, 12)).toBeNull()
  })
})

describe('set operations', () => {
  test('union, subtract and intersect behave pixel wise', () => {
    const a = Uint8Array.from([0, 255, 0, 255])
    const b = Uint8Array.from([0, 0, 255, 255])
    expect(Array.from(unionMask(a, b))).toEqual([0, 255, 255, 255])
    expect(Array.from(subtractMask(a, b))).toEqual([0, 255, 0, 0])
    expect(Array.from(intersectMask(a, b))).toEqual([0, 0, 0, 255])
  })

  test('refuses masks of different lengths instead of silently truncating', () => {
    expect(() => unionMask(new Uint8Array(4), new Uint8Array(5))).toThrow(RangeError)
  })
})

describe('cutElement', () => {
  test('keeps pixels inside the mask (alpha scaled) and zeroes the rest', () => {
    const raster = solidRaster(10, 10, 10, 20, 30)
    const mask = rectMask(10, 10, { x: 2, y: 2, width: 3, height: 3 })
    mask[2 * 10 + 3] = 128
    const out = cutElement(raster, mask, { x: 0, y: 0, width: 10, height: 10 })
    expect(out.width).toBe(10)
    expect(out.height).toBe(10)
    const alphaAt = (x: number, y: number): number => out.data[(y * 10 + x) * 4 + 3]
    expect(alphaAt(0, 0)).toBe(0)
    expect(alphaAt(2, 2)).toBe(255)
    expect(alphaAt(3, 2)).toBe(128)
    expect(alphaAt(1, 5)).toBe(0)
    // RGB survives inside the mask.
    expect(out.data[(2 * 10 + 2) * 4]).toBe(10)
    expect(out.data[(2 * 10 + 2) * 4 + 1]).toBe(20)
    expect(out.data[(2 * 10 + 2) * 4 + 2]).toBe(30)
    // RGB is cleared outside so no hidden colour bleeds back.
    expect(out.data.slice(0, 3)).toEqual(new Uint8ClampedArray([0, 0, 0]))
  })

  test('crops to the bounds and clamps them to the raster', () => {
    const raster = solidRaster(10, 10, 200, 100, 50)
    const mask = rectMask(10, 10, { x: 0, y: 0, width: 10, height: 10 })
    const cropped = cutElement(raster, mask, { x: 8, y: 8, width: 5, height: 5 })
    expect(cropped.width).toBe(2)
    expect(cropped.height).toBe(2)
    expect(cropped.data.length).toBe(2 * 2 * 4)
    const outside = cutElement(raster, mask, { x: 50, y: 50, width: 4, height: 4 })
    expect(outside.width).toBe(1)
    expect(outside.height).toBe(1)
    expect(outside.data[3]).toBe(0)
  })
})

describe('resizeMask', () => {
  test('halving a full block halves its area exactly (area average)', () => {
    const width = 40
    const height = 40
    const mask = rectMask(width, height, { x: 10, y: 10, width: 20, height: 20 })
    const out = resizeMask(mask, width, height, 20, 20)
    expect(out.length).toBe(400)
    // The 20x20 block covers the whole 10..19 output range, so area scales by exactly 4.
    expect(maskArea(out)).toBe(100)
    expect(bboxOf(out, 20, 20)).toEqual({ x: 5, y: 5, width: 10, height: 10 })
  })

  test('doubling keeps the shape and multiplies the area', () => {
    const mask = rectMask(20, 20, { x: 5, y: 5, width: 10, height: 10 })
    const out = resizeMask(mask, 20, 20, 40, 40)
    expect(out.length).toBe(1600)
    expect(maskArea(out)).toBeGreaterThanOrEqual(400)
    const box = bboxOf(out, 40, 40)
    expect(box).not.toBeNull()
    // Bilinear interpolation spreads a source pixel over the output pixel on either side of it, so the
    // box grows by at most one pixel per side.
    expect(box?.width).toBeGreaterThanOrEqual(20)
    expect(box?.width).toBeLessThanOrEqual(22)
    expect(box?.height).toBeGreaterThanOrEqual(20)
    expect(box?.height).toBeLessThanOrEqual(22)
  })

  test('keeps a soft mask soft', () => {
    const mask = rectMask(20, 20, { x: 5, y: 5, width: 10, height: 10 })
    const soft = featherMask(mask, 20, 20, 2)
    const out = resizeMask(soft, 20, 20, 10, 10)
    let intermediate = 0
    for (let i = 0; i < out.length; i++) if (out[i] > 0 && out[i] < 255) intermediate++
    expect(intermediate).toBeGreaterThan(0)
  })

  test('never returns a zero sized mask', () => {
    const out = resizeMask(new Uint8Array(4), 2, 2, 0, 0)
    expect(out.length).toBe(1)
  })
})

describe('featherMask', () => {
  test('produces a real soft ramp at the edges', () => {
    const width = 40
    const height = 40
    const mask = rectMask(width, height, { x: 10, y: 10, width: 20, height: 20 })
    const out = featherMask(mask, width, height, 2)
    expect(out[20 * width + 20]).toBe(255)
    const edge = out[20 * width + 10]
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(255)
    expect(out[0]).toBe(0)
    expect(out[39 * width + 39]).toBe(0)
    let soft = 0
    for (let i = 0; i < out.length; i++) if (out[i] > 0 && out[i] < 255) soft++
    expect(soft).toBeGreaterThan(0)
  })

  test('radius 0 is an exact copy', () => {
    const mask = rectMask(8, 8, { x: 2, y: 2, width: 4, height: 4 })
    expect(Array.from(featherMask(mask, 8, 8, 0))).toEqual(Array.from(mask))
  })
})

describe('grayscale', () => {
  test('is the luminance of RGB', () => {
    const raster = solidRaster(2, 1, 255, 0, 0, 0)
    raster.data[4] = 0
    raster.data[5] = 255
    raster.data[6] = 0
    raster.data[7] = 0
    const out = grayscale(raster)
    expect(Array.from(out)).toEqual([76, 150])
  })
})
