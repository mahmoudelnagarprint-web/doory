import { describe, expect, it } from 'vitest'
import { applyEffect, cartoon, grayscale, ink, lineArt, pencilSketch, stencil, type PixelBuffer } from './filters'

/** 3x3 image: white/dark checker around a mid-grey centre, plus a transparent corner. */
function testImage(): PixelBuffer {
  const data = new Uint8ClampedArray(3 * 3 * 4)
  const set = (x: number, y: number, r: number, g: number, b: number, a = 255): void => {
    const i = (y * 3 + x) * 4
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a
  }
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) set(x, y, x * 60, y * 60, 128)
  }
  set(2, 2, 10, 10, 10, 0) // fully transparent pixel
  return { data, width: 3, height: 3 }
}

describe('grayscale', () => {
  it('makes channels equal while preserving alpha', () => {
    const out = grayscale(testImage())
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(out[i + 1])
      expect(out[i]).toBe(out[i + 2])
      expect(out[i + 3]).toBe(testImage().data[i + 3])
    }
  })

  it('does not mutate the input (purity — before/after must stay pristine)', () => {
    const image = testImage()
    const before = new Uint8ClampedArray(image.data)
    grayscale(image)
    expect(Array.from(image.data)).toEqual(Array.from(before))
  })
})

describe('stencil', () => {
  it('hard-thresholds on luma and keeps alpha', () => {
    const image = testImage()
    // Make a plainly bright and a plainly dark pixel.
    image.data[0] = image.data[1] = image.data[2] = 240        // pixel (0,0)
    image.data[8 + 0] = image.data[8 + 1] = image.data[8 + 2] = 20 // pixel (2,0)
    const out = stencil(image, 0.5)
    expect(out[0]).toBe(255)                  // bright luma -> paper
    expect(out[8]).toBe(0)                    // dark luma -> ink
    expect(out[(2 * 3 + 2) * 4 + 3]).toBe(0)  // alpha untouched
  })
})

describe('lineArt', () => {
  it('renders a flat image as blank paper (no edges -> no strokes)', () => {
    const flat: PixelBuffer = {
      data: new Uint8ClampedArray(Array.from({ length: 16 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 128))),
      width: 4,
      height: 4,
    }
    const out = lineArt(flat, 1)
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(255)
      expect(out[i + 1]).toBe(255)
      expect(out[i + 2]).toBe(255)
      expect(out[i + 3]).toBe(255)
    }
  })
})

describe('ink', () => {
  it('maps luma strictly to black or white', () => {
    const out = ink(testImage(), 0.5, 1)
    for (let i = 0; i < out.length; i += 4) {
      const v = out[i]
      expect(v === 0 || v === 255, `pixel ${i / 4}`).toBe(true)
      expect(out[i + 1]).toBe(v)
      expect(out[i + 2]).toBe(v)
    }
  })
})

describe('pencilSketch', () => {
  it('keeps alpha and stays monochrome', () => {
    const out = pencilSketch(testImage(), 1, 1)
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(out[i + 1])
      expect(out[i]).toBe(out[i + 2])
    }
    expect(out[(2 * 3 + 2) * 4 + 3]).toBe(0)
  })
})

describe('cartoon', () => {
  it('posterises onto a small level set and preserves the channel count', () => {
    const out = cartoon(testImage(), 4, 0) // no outline -> pure posterise
    const levels = 4
    const q = 255 / (levels - 1)
    for (let p = 0; p < out.length / 4; p++) {
      for (let c = 0; c < 3; c++) {
        const v = out[p * 4 + c]
        // A quantised value is an exact multiple of the quantisation step below rounding.
        const nearest = Math.round(v / q) * q
        expect(Math.abs(v - nearest)).toBeLessThanOrEqual(q / 2 + 1)
      }
    }
  })
})

describe('applyEffect', () => {
  it('rejects an aborted operation by throwing AbortError', () => {
    const controller = new AbortController()
    controller.abort()
    expect(() => applyEffect(testImage(), 'sketch', { signal: controller.signal })).toThrow()
    try {
      applyEffect(testImage(), 'sketch', { signal: controller.signal })
    } catch (error) {
      expect((error as DOMException).name).toBe('AbortError')
    }
  })

  it('strength 0 keeps the original colour through the post-blend path', () => {
    const out = applyEffect(testImage(), 'stencil', { strength: 0 })
    const original = testImage().data
    for (let i = 0; i < out.length; i += 4) {
      for (let c = 0; c < 3; c++) expect(out[i + c]).toBe(original[i + c])
    }
  })

  it('dispatches the requested effect kind', () => {
    const result = applyEffect(testImage(), 'grayscaleSketch', { strength: 1 })
    const direct = pencilSketch(testImage(), 2 + 0.5 * 26, 1)
    expect(Array.from(result.slice(0, 12))).toEqual(Array.from(direct.slice(0, 12)))
  })
})
