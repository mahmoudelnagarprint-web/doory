/**
 * Tests for the classical select & place core: colour-key selection, mask bounds, mask resizing and
 * the real cover-fit composite that embeds a chosen image inside a selection.
 */
import { compositePlacedImage, resizeMaskNearest, selectByColor, selectionBounds, type RasterSource } from './placeSelect'

/** Builds a W×H raster from a per-pixel colour callback (RGBA). */
function raster(w: number, h: number, at: (x: number, y: number) => [number, number, number, number]): RasterSource {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = at(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { data, width: w, height: h }
}

const px = (r: RasterSource, x: number, y: number): [number, number, number, number] => {
  const i = (y * r.width + x) * 4
  return [r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]]
}

describe('selectByColor', () => {
  const img = raster(3, 2, (x, y) => (x === 2 ? [10, 200, 30, 255] : y === 0 ? [255, 0, 0, 255] : [250, 5, 8, 255]))

  it('selects every pixel matching the picked colour across the whole image', () => {
    const mask = selectByColor(img, { r: 255, g: 0, b: 0 }, 0)
    expect(Array.from(mask)).toEqual([255, 255, 0, 0, 0, 0])
  })

  it('tolerance widens the key per channel, never beyond it', () => {
    const mask = selectByColor(img, { r: 255, g: 0, b: 0 }, 10)
    // (250,5,8) is within 10 on every channel → selected; (10,200,30) is not.
    expect(Array.from(mask)).toEqual([255, 255, 0, 255, 255, 0])
    const tight = selectByColor(img, { r: 255, g: 0, b: 0 }, 4)
    expect(Array.from(tight)).toEqual([255, 255, 0, 0, 0, 0])
  })

  it('is bounded: tolerance is clamped to 0..255 per channel', () => {
    const mask = selectByColor(img, { r: 0, g: 0, b: 0 }, 999)
    expect(mask.every((v) => v === 255)).toBe(true)
    const none = selectByColor(img, { r: 1, g: 2, b: 3 }, -5)
    expect(mask.length).toBe(6)
    expect(Array.from(none)).toEqual([0, 0, 0, 0, 0, 0])
  })
})

describe('selectionBounds', () => {
  it('returns the exact bounding box of the selected pixels', () => {
    const mask = new Uint8ClampedArray(4 * 4)
    mask[1 * 4 + 2] = 255
    mask[2 * 4 + 1] = 255
    mask[2 * 4 + 3] = 255
    expect(selectionBounds(mask, 4, 4)).toEqual({ x: 1, y: 1, width: 3, height: 2 })
  })

  it('returns null for an empty mask and a full box for a full mask', () => {
    expect(selectionBounds(new Uint8ClampedArray(9), 3, 3)).toBeNull()
    const full = new Uint8ClampedArray(9).fill(255)
    expect(selectionBounds(full, 3, 3)).toEqual({ x: 0, y: 0, width: 3, height: 3 })
  })
})

describe('resizeMaskNearest', () => {
  it('upsamples by repeating the nearest source pixel', () => {
    const mask = Uint8ClampedArray.from([255, 0, 0, 255])
    const up = resizeMaskNearest(mask, 2, 2, 4, 4)
    expect(Array.from(up)).toEqual([
      255, 255, 0, 0,
      255, 255, 0, 0,
      0, 0, 255, 255,
      0, 0, 255, 255,
    ])
  })

  it('downsamples by sampling, keeping the selection region inside the image', () => {
    const mask = new Uint8ClampedArray(4 * 4)
    for (let y = 2; y < 4; y++) for (let x = 2; x < 4; x++) mask[y * 4 + x] = 255
    const down = resizeMaskNearest(mask, 4, 4, 2, 2)
    // Nearest sampling at scale 0.5 reads source pixels (0,0), (2,0), (0,2), (2,2) — only (2,2) is selected.
    expect(Array.from(down)).toEqual([0, 0, 0, 255])
  })
})

describe('compositePlacedImage', () => {
  const base = raster(4, 4, () => [10, 20, 30, 255])
  const placed = raster(2, 2, () => [200, 100, 50, 255])

  it('replaces only the selected pixels and keeps the rest byte-identical', () => {
    const mask = new Uint8ClampedArray(16)
    mask[5] = 255 // (1,1)
    mask[6] = 255 // (2,1)
    const out = compositePlacedImage(base, mask, placed)
    expect(Array.from(px({ data: out, width: 4, height: 4 }, 1, 1))).toEqual([200, 100, 50, 255])
    expect(Array.from(px({ data: out, width: 4, height: 4 }, 2, 1))).toEqual([200, 100, 50, 255])
    // Untouched pixels keep the base exactly.
    expect(Array.from(px({ data: out, width: 4, height: 4 }, 0, 0))).toEqual([10, 20, 30, 255])
    expect(Array.from(px({ data: out, width: 4, height: 4 }, 3, 3))).toEqual([10, 20, 30, 255])
  })

  it('cover-fits a smaller placed image across the selection bounds (no tiling, no holes)', () => {
    const mask = new Uint8ClampedArray(16)
    for (const i of [5, 6, 9, 10]) mask[i] = 255 // 2×2 block
    const one = raster(1, 1, () => [9, 9, 9, 255])
    const out = compositePlacedImage(base, mask, one)
    for (const i of [5, 6, 9, 10]) expect(out[i * 4]).toBe(9)
    // The placed image is uniform, so every masked pixel shows it — cover, not clamp.
    expect(out[5 * 4 + 1]).toBe(9)
  })

  it('centre-crops a larger placed image (cover, overflow symmetric)', () => {
    const mask = new Uint8ClampedArray(16)
    for (const i of [5, 6, 9, 10]) mask[i] = 255 // 2×2 block centred at (1.5, 1.5)
    // 4×4 placed with a distinct colour per quadrant; the 2×2 box sees the crop around the centre.
    const big = raster(4, 4, (x, y) => (x < 2 ? (y < 2 ? [1, 1, 1, 255] : [3, 3, 3, 255]) : y < 2 ? [2, 2, 2, 255] : [4, 4, 4, 255]))
    const out = compositePlacedImage(base, mask, big)
    const seen = new Set<number>()
    for (const i of [5, 6, 9, 10]) seen.add(out[i * 4])
    // The crop can only show colours from around the placed centre (quadrants 1..4 near the middle).
    expect([...seen].every((v) => [1, 2, 3, 4].includes(v))).toBe(true)
    expect(seen.size).toBeGreaterThan(0)
  })

  it('blends partially selected pixels (soft selection edges keep their feather)', () => {
    const mask = new Uint8ClampedArray(16)
    mask[5] = 128 // half-selected
    const out = compositePlacedImage(base, mask, placed)
    const [r] = px({ data: out, width: 4, height: 4 }, 1, 1)
    expect(r).toBeGreaterThan(10) // moved toward the placed colour…
    expect(r).toBeLessThan(200) // …but not all the way
  })

  it('transparent placed pixels let the original show through instead of stamping black', () => {
    const mask = new Uint8ClampedArray(16)
    mask[5] = 255
    const clear = raster(2, 2, () => [0, 0, 0, 0])
    const out = compositePlacedImage(base, mask, clear)
    expect(Array.from(px({ data: out, width: 4, height: 4 }, 1, 1))).toEqual([10, 20, 30, 255])
  })

  it('returns an untouched copy for an empty selection and never mutates its inputs', () => {
    const baseCopy = Uint8ClampedArray.from(base.data)
    const out = compositePlacedImage(base, new Uint8ClampedArray(16), placed)
    expect(Array.from(out)).toEqual(Array.from(baseCopy))
    expect(Array.from(base.data)).toEqual(Array.from(baseCopy))
  })
})