/**
 * Unit tests for the pure-pixel half of the AI sticker cutout engine
 * (no canvas, no network, no WASM — everything is plain `PixelBuffer` math).
 */

import { describe, expect, it } from 'vitest'
import {
  applyDieCutBorder,
  applyEdgeControls,
  autoCropTransparentBounds,
  autoDetectMode,
  brushStroke,
  CutoutError,
  featherAlpha,
  morphAlpha,
  sampleBorder,
  studioCutout,
  transparentBounds,
  type PixelBuffer,
} from './stickerCutout'

/** Flat RGBA buffer filled pixel-by-pixel from a function. */
function makeBuffer(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { data, width, height }
}

function flatBackground(w: number, h: number, rgba: [number, number, number, number]): PixelBuffer {
  return makeBuffer(w, h, () => rgba)
}

function paintRect(
  buffer: PixelBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgba: [number, number, number, number],
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * buffer.width + x) * 4
      buffer.data[i] = rgba[0]
      buffer.data[i + 1] = rgba[1]
      buffer.data[i + 2] = rgba[2]
      buffer.data[i + 3] = rgba[3]
    }
  }
}

function alphaAt(buffer: PixelBuffer, x: number, y: number): number {
  return buffer.data[(y * buffer.width + x) * 4 + 3]
}

function alphaIn(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  return data[(y * width + x) * 4 + 3]
}

function countOpaque(buffer: PixelBuffer): number {
  let count = 0
  for (let i = 3; i < buffer.data.length; i += 4) if (buffer.data[i] > 128) count++
  return count
}

describe('sampleBorder', () => {
  it('returns the flat border colour', () => {
    const sample = sampleBorder(flatBackground(8, 8, [255, 0, 0, 255]))
    expect(sample.color).toEqual([255, 0, 0])
    expect(sample.transparentFraction).toBe(0)
  })

  it('reports an already transparent border', () => {
    expect(sampleBorder(flatBackground(8, 8, [0, 0, 0, 0])).transparentFraction).toBe(1)
  })
})

describe('autoDetectMode', () => {
  it('picks studio for a flat border', () => {
    expect(autoDetectMode(flatBackground(12, 12, [255, 255, 255, 255]))).toBe('studio')
  })

  it('picks studio when the border is already transparent', () => {
    expect(autoDetectMode(flatBackground(8, 8, [0, 0, 0, 0]))).toBe('studio')
  })

  it('picks neural for a busy photo border', () => {
    const buffer = flatBackground(24, 24, [120, 90, 60, 255])
    // Flip every other column's colour far outside any tolerance.
    for (let x = 0; x < buffer.width; x += 2) {
      for (let y = 0; y < buffer.height; y++) {
        const i = (y * buffer.width + x) * 4
        buffer.data[i] = 255 - buffer.data[i]
        buffer.data[i + 1] = 255 - buffer.data[i + 1]
        buffer.data[i + 2] = 255 - buffer.data[i + 2]
      }
    }
    expect(autoDetectMode(buffer)).toBe('neural')
  })
})

describe('studioCutout', () => {
  it('flood-fills the connected background and keeps interior holes', () => {
    // 9×9: red background, blue 3×3 subject, one red pixel inside it (a hole).
    const buffer = flatBackground(9, 9, [255, 0, 0, 255])
    paintRect(buffer, 3, 3, 3, 3, [0, 0, 255, 255])
    const hole = (4 * 9 + 4) * 4
    buffer.data[hole] = 255 // red again
    buffer.data[hole + 1] = 0
    buffer.data[hole + 2] = 0

    const result = studioCutout(buffer, { tolerance: 40, edgeChoke: 0, edgeFeather: 0 })

    // Corners (background) are gone.
    expect(alphaAt(result, 0, 0)).toBe(0)
    expect(alphaAt(result, 8, 0)).toBe(0)
    expect(alphaAt(result, 8, 8)).toBe(0)
    // The blue subject survived.
    expect(alphaAt(result, 3, 3)).toBeGreaterThan(200)
    expect(alphaAt(result, 5, 5)).toBeGreaterThan(200)
    // The interior red "hole" was NOT removed (no seed touches it) and keeps its colour.
    expect(result.data[hole]).toBe(255)
  })

  it('throws empty for a fully transparent image', () => {
    expect(() => studioCutout(flatBackground(4, 4, [0, 0, 0, 0]))).toThrow(CutoutError)
  })

  it('applies a positive edge choke (erosion) to the mask', () => {
    const buffer = flatBackground(9, 9, [255, 0, 0, 255])
    paintRect(buffer, 2, 2, 5, 5, [0, 0, 255, 255])
    const plain = studioCutout(buffer, { tolerance: 40, edgeChoke: 0, edgeFeather: 0 })
    const choked = studioCutout(buffer, { tolerance: 40, edgeChoke: 2, edgeFeather: 0 })
    expect(countOpaque(choked)).toBeLessThan(countOpaque(plain))
    // And applying the same controls directly to a buffer also erodes.
    expect(countOpaque(applyEdgeControls(plain, 2, 0))).toBeLessThan(countOpaque(plain))
  })
})

describe('morphAlpha', () => {
  it('erodes a lone pixel away with px > 0', () => {
    const w = 3
    const data = new Uint8ClampedArray(w * w * 4)
    data[(1 * w + 1) * 4 + 3] = 255 // centre pixel only
    morphAlpha(data, w, w, 1)
    expect(alphaIn(data, w, 1, 1)).toBe(0)
  })

  it('dilates with px < 0', () => {
    const w = 5
    const data = new Uint8ClampedArray(w * w * 4)
    data[(2 * w + 2) * 4 + 3] = 255
    morphAlpha(data, w, w, -1)
    expect(alphaIn(data, w, 1, 2)).toBe(255)
    expect(alphaIn(data, w, 2, 1)).toBe(255)
    expect(alphaIn(data, w, 3, 2)).toBe(255)
    expect(alphaIn(data, w, 2, 3)).toBe(255)
  })
})

describe('featherAlpha', () => {
  it('softens the alpha edge into a gradient', () => {
    const w = 9, h = 9
    const data = flatBackground(w, h, [10, 20, 30, 255]).data
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        data[(y * w + x) * 4 + 3] = (x - 4) ** 2 + (y - 4) ** 2 <= 9 ? 255 : 0
      }
    }
    const before = alphaIn(data, w, 3, 4) // just inside the circle edge
    expect(before).toBe(255)
    featherAlpha(data, w, h, 2)
    const after = alphaIn(data, w, 3, 4)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
  })
})

describe('transparentBounds / autoCropTransparentBounds', () => {
  it('finds the tight content bounds and crops with padding', () => {
    const buffer = flatBackground(20, 20, [0, 0, 0, 0])
    paintRect(buffer, 5, 8, 4, 3, [255, 0, 0, 255])
    const bounds = transparentBounds(buffer)
    expect(bounds.x).toBe(5)
    expect(bounds.y).toBe(8)
    expect(bounds.width).toBe(4)
    expect(bounds.height).toBe(3)

    const cropped = autoCropTransparentBounds(buffer, 1)
    expect(cropped.width).toBe(6)
    expect(cropped.height).toBe(5)
    expect(alphaAt(cropped, 1, 1)).toBe(255)
  })

  it('returns the buffer untouched when it is fully opaque', () => {
    const cropped = autoCropTransparentBounds(flatBackground(4, 4, [10, 20, 30, 255]))
    expect(cropped.width).toBe(4)
    expect(cropped.height).toBe(4)
  })
})

describe('brushStroke', () => {
  it('erases inside the brush and keeps the rest', () => {
    const buffer = flatBackground(11, 11, [0, 128, 255, 255])
    brushStroke(buffer, buffer, 4, 4, 3, 0, 'erase')
    expect(alphaAt(buffer, 4, 4)).toBe(0)
    expect(alphaAt(buffer, 0, 0)).toBe(255)
    expect(alphaAt(buffer, 9, 9)).toBe(255)
  })

  it('restore paints the original pixels back from the source buffer', () => {
    const source = flatBackground(9, 9, [200, 40, 40, 255])
    const target = flatBackground(9, 9, [200, 40, 40, 0]) // fully erased
    brushStroke(target, source, 4, 4, 2, 0, 'restore')
    expect(alphaAt(target, 4, 4)).toBe(255)
    expect(target.data[(4 * 9 + 4) * 4]).toBe(200)
    expect(alphaAt(target, 0, 0)).toBe(0) // untouched by the brush
  })
})

describe('applyDieCutBorder', () => {
  it('grows the canvas and paints a coloured contour around the artwork', () => {
    const buffer = flatBackground(6, 6, [0, 0, 255, 255])
    const out = applyDieCutBorder(buffer, { borderPx: 3, color: '#ffffff' })
    expect(out.width).toBe(12) // 6 + 2×3 pad
    expect(out.height).toBe(12)
    // A ring pixel just outside the artwork is the border colour (white).
    const ring = (3 * out.width + 2) * 4
    expect(out.data[ring]).toBe(255)
    expect(out.data[ring + 1]).toBe(255)
    expect(out.data[ring + 2]).toBe(255)
    expect(out.data[ring + 3]).toBeGreaterThan(0)
    // The centre stays the artwork (blue).
    const centre = (6 * out.width + 6) * 4
    expect(out.data[centre]).toBe(0)
    expect(out.data[centre + 2]).toBe(255)
    expect(out.data[centre + 3]).toBe(255)
  })
})
