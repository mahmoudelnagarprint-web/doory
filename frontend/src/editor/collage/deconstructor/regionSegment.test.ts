import { describe, expect, test } from 'vitest'
import { colorDistance, classicalForeground, decomposeRegions, estimateBackgroundColor } from './regionSegment'
import { bboxOf, maskArea } from './maskOps'
import type { PixelRect, Raster } from './types'

interface Rgb {
  r: number
  g: number
  b: number
}

/** A fully opaque raster filled with one colour. */
function makeRaster(width: number, height: number, fill: Rgb): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill.r
    data[i * 4 + 1] = fill.g
    data[i * 4 + 2] = fill.b
    data[i * 4 + 3] = 255
  }
  return { width, height, data }
}

/** Paints a solid rectangle into a raster (clipped). */
function fillRect(raster: Raster, rect: PixelRect, colour: Rgb): void {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    if (y < 0 || y >= raster.height) continue
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (x < 0 || x >= raster.width) continue
      const at = (y * raster.width + x) * 4
      raster.data[at] = colour.r
      raster.data[at + 1] = colour.g
      raster.data[at + 2] = colour.b
      raster.data[at + 3] = 255
    }
  }
}

const OPTIONS = { minPixels: 20, maxRegions: 10, colorTolerance: 36 }

describe('estimateBackgroundColor', () => {
  test('reads the dominant border colour', () => {
    const raster = makeRaster(60, 40, { r: 240, g: 240, b: 235 })
    fillRect(raster, { x: 20, y: 15, width: 20, height: 10 }, { r: 10, g: 10, b: 10 })
    expect(estimateBackgroundColor(raster)).toEqual({ r: 240, g: 240, b: 235 })
  })

  test('falls back to white for a fully transparent image', () => {
    const raster = makeRaster(4, 4, { r: 12, g: 34, b: 56 })
    for (let i = 0; i < 16; i++) raster.data[i * 4 + 3] = 0
    expect(estimateBackgroundColor(raster)).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('colorDistance', () => {
  test('is the largest per channel difference', () => {
    expect(colorDistance({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(0)
    expect(colorDistance({ r: 10, g: 20, b: 30 }, { r: 13, g: 5, b: 40 })).toBe(15)
  })
})

describe('classicalForeground', () => {
  test('marks a distinct rectangle and nothing else', () => {
    const raster = makeRaster(120, 120, { r: 240, g: 240, b: 235 })
    fillRect(raster, { x: 30, y: 35, width: 40, height: 25 }, { r: 30, g: 60, b: 200 })
    const mask = classicalForeground(raster)
    expect(mask.length).toBe(120 * 120)
    expect(maskArea(mask)).toBe(40 * 25)
    expect(bboxOf(mask, 120, 120)).toEqual({ x: 30, y: 35, width: 40, height: 25 })
    expect(mask[0]).toBe(0)
    expect(mask[35 * 120 + 30]).toBe(255)
  })

  test('honours an explicit background colour', () => {
    const raster = makeRaster(40, 40, { r: 240, g: 240, b: 235 })
    fillRect(raster, { x: 10, y: 10, width: 10, height: 10 }, { r: 30, g: 60, b: 200 })
    const mask = classicalForeground(raster, { r: 30, g: 60, b: 200 })
    expect(maskArea(mask)).toBe(40 * 40 - 100)
  })

  test('finds nothing in a uniform image', () => {
    const raster = makeRaster(50, 50, { r: 128, g: 128, b: 128 })
    expect(maskArea(classicalForeground(raster))).toBe(0)
  })

  test('treats transparent pixels as background', () => {
    const raster = makeRaster(20, 20, { r: 20, g: 20, b: 20 })
    for (let i = 0; i < 400; i++) raster.data[i * 4 + 3] = 0
    expect(maskArea(classicalForeground(raster, { r: 0, g: 0, b: 0 }))).toBe(0)
  })
})

describe('decomposeRegions', () => {
  test('returns one region with the exact bounds of a solid rectangle', () => {
    const raster = makeRaster(120, 120, { r: 240, g: 240, b: 235 })
    fillRect(raster, { x: 30, y: 35, width: 40, height: 25 }, { r: 30, g: 60, b: 200 })
    const regions = decomposeRegions(raster, classicalForeground(raster), OPTIONS)
    expect(regions).toHaveLength(1)
    const region = regions[0]
    expect(region.bounds).toEqual({ x: 30, y: 35, width: 40, height: 25 })
    expect(region.area).toBe(1000)
    expect(region.fillRatio).toBe(1)
    expect(region.meanColor).toEqual({ r: 30, g: 60, b: 200 })
    expect(region.touchesBorder).toBe(false)
    expect(region.confidence).toBeGreaterThan(0.9)
    expect(maskArea(region.mask)).toBe(1000)
    expect(bboxOf(region.mask, 120, 120)).toEqual({ x: 30, y: 35, width: 40, height: 25 })
  })

  test('splits two differently coloured touching blobs into two regions', () => {
    const raster = makeRaster(120, 120, { r: 245, g: 245, b: 245 })
    fillRect(raster, { x: 20, y: 40, width: 30, height: 30 }, { r: 200, g: 30, b: 40 })
    fillRect(raster, { x: 50, y: 40, width: 30, height: 30 }, { r: 40, g: 60, b: 200 })
    const foreground = classicalForeground(raster)
    // Both blobs really are one 8-connected component, so only the colour split can separate them.
    expect(maskArea(foreground)).toBe(1800)
    const regions = decomposeRegions(raster, foreground, OPTIONS)
    expect(regions).toHaveLength(2)
    expect(regions[0].bounds).toEqual({ x: 20, y: 40, width: 30, height: 30 })
    expect(regions[0].meanColor).toEqual({ r: 200, g: 30, b: 40 })
    expect(regions[1].bounds).toEqual({ x: 50, y: 40, width: 30, height: 30 })
    expect(regions[1].meanColor).toEqual({ r: 40, g: 60, b: 200 })
    expect(regions[0].area).toBe(900)
    expect(regions[1].area).toBe(900)
  })

  test('keeps a single multi-coloured rectangle together below the split area threshold', () => {
    const raster = makeRaster(200, 200, { r: 250, g: 250, b: 250 })
    fillRect(raster, { x: 10, y: 10, width: 10, height: 10 }, { r: 20, g: 20, b: 20 })
    fillRect(raster, { x: 20, y: 10, width: 10, height: 10 }, { r: 220, g: 20, b: 20 })
    const regions = decomposeRegions(raster, classicalForeground(raster), OPTIONS)
    expect(regions).toHaveLength(1)
    expect(regions[0].area).toBe(200)
  })

  test('returns nothing for a uniform image', () => {
    const raster = makeRaster(80, 80, { r: 200, g: 190, b: 180 })
    expect(decomposeRegions(raster, classicalForeground(raster), OPTIONS)).toEqual([])
  })

  test('returns nothing for an all background mask', () => {
    const raster = makeRaster(40, 40, { r: 10, g: 10, b: 10 })
    expect(decomposeRegions(raster, new Uint8Array(40 * 40), OPTIONS)).toEqual([])
  })

  test('drops regions below minPixels', () => {
    const raster = makeRaster(120, 120, { r: 240, g: 240, b: 235 })
    fillRect(raster, { x: 30, y: 35, width: 40, height: 25 }, { r: 30, g: 60, b: 200 })
    fillRect(raster, { x: 90, y: 90, width: 3, height: 3 }, { r: 0, g: 0, b: 0 })
    const regions = decomposeRegions(raster, classicalForeground(raster), { minPixels: 20, maxRegions: 10, colorTolerance: 36 })
    expect(regions).toHaveLength(1)
    expect(regions[0].area).toBe(1000)
  })

  test('caps the result at maxRegions keeping the strongest first', () => {
    const raster = makeRaster(120, 120, { r: 240, g: 240, b: 235 })
    fillRect(raster, { x: 2, y: 2, width: 20, height: 20 }, { r: 20, g: 20, b: 20 })
    fillRect(raster, { x: 40, y: 2, width: 10, height: 10 }, { r: 20, g: 20, b: 20 })
    fillRect(raster, { x: 80, y: 2, width: 15, height: 15 }, { r: 20, g: 20, b: 20 })
    const regions = decomposeRegions(raster, classicalForeground(raster), { minPixels: 20, maxRegions: 2, colorTolerance: 36 })
    expect(regions).toHaveLength(2)
    expect(regions[0].area).toBe(400)
    expect(regions[1].area).toBe(225)
  })

  test('refuses a mask that does not match the raster size', () => {
    const raster = makeRaster(20, 20, { r: 0, g: 0, b: 0 })
    expect(() => decomposeRegions(raster, new Uint8Array(10), OPTIONS)).toThrow(RangeError)
  })

  test('reports border contact for a region touching the edge', () => {
    const raster = makeRaster(60, 60, { r: 240, g: 240, b: 235 })
    fillRect(raster, { x: 0, y: 20, width: 20, height: 20 }, { r: 10, g: 10, b: 10 })
    const regions = decomposeRegions(raster, classicalForeground(raster), OPTIONS)
    expect(regions).toHaveLength(1)
    expect(regions[0].touchesBorder).toBe(true)
    expect(regions[0].bounds).toEqual({ x: 0, y: 20, width: 20, height: 20 })
  })
})
