import { describe, expect, it } from 'vitest'
import { computeExpandRect, expandClassical, generateMask, type EdgeSpec } from './expand'

const pxSpec = (top: number, right: number, bottom: number, left: number): EdgeSpec => ({ top, right, bottom, left, unit: 'pixels' })

describe('computeExpandRect', () => {
  it('maps pixels directly', () => {
    const rect = computeExpandRect(100, 60, pxSpec(10, 20, 30, 5))
    expect(rect.width).toBe(125)
    expect(rect.height).toBe(100)
    expect(rect.offsetX).toBe(5)
    expect(rect.offsetY).toBe(10)
    expect(rect.edges).toEqual({ top: 10, right: 20, bottom: 30, left: 5 })
  })

  it('scales percentages relative to the ORIGINAL side per edge', () => {
    const rect = computeExpandRect(200, 100, { top: 10, right: 50, bottom: 25, left: 0, unit: 'percent' })
    expect(rect.edges.top).toBe(10)      // 10% of height
    expect(rect.edges.right).toBe(100)   // 50% of width
    expect(rect.edges.bottom).toBe(25)   // 25% of height
    expect(rect.edges.left).toBe(0)
  })

  it('rounds offsets symmetrically so the original lands on whole pixels', () => {
    const rect = computeExpandRect(101, 33, pxSpec(1.5, 2.5, 1.5, 4.5))
    expect([rect.offsetX, rect.offsetY]).toEqual([5, 2])
    expect(rect.width).toBe(5 + 101 + 3)   // round(4.5)+101+round(2.5)
    expect(rect.height).toBe(2 + 33 + 2)   // round(1.5)+33+round(1.5)
  })
})

describe('generateMask', () => {
  it('marks only the non-original area at 255', () => {
    const rect = computeExpandRect(4, 4, pxSpec(2, 1, 1, 1))
    const mask = generateMask(rect)
    expect(mask).toHaveLength(rect.width * rect.height)
    const at = (x: number, y: number): number => mask[y * rect.width + x]
    expect(at(2, 0)).toBe(255)          // top band
    expect(at(2, 6)).toBe(255)          // bottom band
    expect(at(0, 3)).toBe(255)          // left border band
    expect(at(5, 3)).toBe(255)          // right border band
    expect(at(2, 3)).toBe(0)            // inside the original region
  })

  it('returns an all-zero mask when nothing expands', () => {
    const mask = generateMask(computeExpandRect(3, 3, pxSpec(0, 0, 0, 0)))
    expect(mask.every((v) => v === 0)).toBe(true)
  })
})

describe('expandClassical', () => {
  // 2x2 test image with DISTINCT pixels, alpha in the last channel.
  const src = {
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,     // row 0: red, green
      0, 0, 255, 255, 255, 255, 255, 128, // row 1: blue, white (half alpha)
    ]),
    width: 2,
    height: 2,
  }

  function buildImage(mode: 'mirror' | 'replicate'): ImageDataShape {
    const rect = computeExpandRect(2, 2, pxSpec(1, 1, 1, 1))
    return { rect, out: expandClassical(src, mode, rect) }
  }
  interface ImageDataShape { rect: ReturnType<typeof computeExpandRect>; out: Uint8ClampedArray<ArrayBuffer> }

  const sample = (out: Uint8ClampedArray, rect: ReturnType<typeof computeExpandRect>, x: number, y: number): number[] =>
    Array.from(out.subarray((y * rect.width + x) * 4, (y * rect.width + x) * 4 + 4))

  it('keeps the original region byte-identical (positions AND alpha)', () => {
    for (const mode of ['mirror', 'replicate'] as const) {
      const { rect, out } = buildImage(mode)
      expect(sample(out, rect, 1, 1)).toEqual([255, 0, 0, 255])
      expect(sample(out, rect, 2, 1)).toEqual([0, 255, 0, 255])
      expect(sample(out, rect, 1, 2)).toEqual([0, 0, 255, 255])
      expect(sample(out, rect, 2, 2)).toEqual([255, 255, 255, 128])
    }
  })

  it('replicate copies the nearest ORIGINAL edge pixel in place (per row/column)', () => {
    const { rect, out } = buildImage('replicate')
    // Left band at row 1 maps to source cell (col 0, row 0) — the nearest edge pixel in place.
    expect(sample(out, rect, 0, 1)).toEqual([255, 0, 0, 255])
    // Top band above column 2 replicates source row 0, column 1 (green).
    expect(sample(out, rect, 2, 0)).toEqual([0, 255, 0, 255])
  })

  it('mirror reflects across each edge (distance 1 -> the edge column)', () => {
    const { rect, out } = buildImage('mirror')
    expect(sample(out, rect, 0, 1)).toEqual([255, 0, 0, 255]) // one left of origin -> column 0
    expect(sample(out, rect, 2, 0)).toEqual([0, 255, 0, 255]) // one above -> row 0, column 1
  })

  it('fills every pixel of the expanded frame with the source orientation preserved (no stretch)', () => {
    const rect = computeExpandRect(2, 2, pxSpec(2, 3, 1, 1))
    const out = expandClassical(src, 'replicate', rect)
    expect(out).toHaveLength(rect.width * rect.height * 4)
    // The interior around the original must still be plausible content, never zeros/white padding.
    expect(sample(out, rect, 1, 1)).toEqual([255, 0, 0, 255])
    expect(sample(out, rect, 4, 0)).toEqual([0, 255, 0, 255])
  })
})
