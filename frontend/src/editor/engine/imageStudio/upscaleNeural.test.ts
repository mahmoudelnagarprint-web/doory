import { describe, expect, it } from 'vitest'
import {
  NEURAL_MODELS, OVERLAP, TILE, packNHWCtoNCHW, runNeuralUpscale, tileGrid, unpackNCHWtoNHWC,
} from './upscaleNeural'

describe('tileGrid', () => {
  it('covers the whole image with no gaps and stays in bounds', () => {
    for (const [w, h] of [[1, 1], [80, 60], [97, 97], [250, 130]] as const) {
      const grid = tileGrid(w, h)
      const coveredBy = (x: number, y: number): boolean =>
        grid.some((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h)
      for (let y = 0; y < h; y += 7) {
        for (let x = 0; x < w; x += 7) {
          expect(coveredBy(Math.min(x, w - 1), Math.min(y, h - 1)), `${w}x${h} at ${x},${y}`).toBe(true)
        }
      }
      for (const t of grid) {
        expect(t.x).toBeGreaterThanOrEqual(0)
        expect(t.y).toBeGreaterThanOrEqual(0)
        expect(t.x + t.w).toBeLessThanOrEqual(w)
        expect(t.y + t.h).toBeLessThanOrEqual(h)
        expect(t.w).toBeGreaterThan(0)
        expect(t.h).toBeGreaterThan(0)
      }
    }
  })

  it('clamps oversized tiles to image bounds even below the tile size', () => {
    expect(tileGrid(40, 40)).toEqual([{ x: 0, y: 0, w: 40, h: 40 }])
  })

  it('uses the declared overlap so neighbouring tiles share receptive context', () => {
    const grid = tileGrid(400, 400)
    expect(grid.length).toBeGreaterThan(1)
    // Consecutive tiles in a row advance by TILE - OVERLAP (not TILE), which is what overlap means.
    const [first, second] = grid
    expect(second.x - first.x).toBe(TILE - OVERLAP)
  })
})

describe('tensor packing', () => {
  it('round-trips NHWC (RGBA) <-> NCHW (planar RGB) without drift', () => {
    const src = new Uint8ClampedArray(2 * 3 * 4)
    for (let i = 0; i < src.length; i++) src[i] = (i * 37) % 256
    const planar = packNHWCtoNCHW(src, 2, 3)
    expect(planar).toHaveLength(2 * 3 * 3)
    // Planar layout: R plane (area floats), then G, then B, values normalised to 0..1.
    expect(planar[0]).toBeCloseTo(src[0] / 255)      // R, pixel 0
    expect(planar[1]).toBeCloseTo(src[4] / 255)      // R, pixel 1
    expect(planar[6]).toBeCloseTo(src[1] / 255)      // G, pixel 0 (area offset = 6)
    expect(planar[1 * 6 + 0]).toBeCloseTo(src[1] / 255) // G plane offset = area
    const back = unpackNCHWtoNHWC(planar, 2, 3)
    for (let i = 0; i < src.length; i += 4) {
      // Float32 storage quantises: round-trip is within one byte of the source.
      expect(Math.abs(back[i] - src[i]), `pixel ${i / 4} R`).toBeLessThanOrEqual(1)
      expect(Math.abs(back[i + 1] - src[i + 1]), `pixel ${i / 4} G`).toBeLessThanOrEqual(1)
      expect(Math.abs(back[i + 2] - src[i + 2]), `pixel ${i / 4} B`).toBeLessThanOrEqual(1)
      expect(back[i + 3]).toBe(255) // alpha restored opaque (this engine outputs RGB only)
    }
  })

  it('normalises into 0..1 so a float32 tensor is valid model input', () => {
    const src = new Uint8ClampedArray(4 * 1 * 4)
    src.fill(255)
    const planar = packNHWCtoNCHW(src, 4, 1)
    expect(Math.max(...planar)).toBe(1)
    expect(Math.min(...planar)).toBeCloseTo(1)
  })
})

describe('honest failure paths', () => {
  it('registry URLs are self-hosted, same-origin paths (no CDN weights)', () => {
    for (const model of NEURAL_MODELS) {
      expect(model.url.startsWith('/media/models/')).toBe(true)
      expect(model.scale === 2 || model.scale === 4).toBe(true)
      expect(model.nameEn.length).toBeGreaterThan(3)
    }
    expect(NEURAL_MODELS.length).toBeGreaterThan(0)
  })

  it('refuses cross-origin model weights as a typed error (never a silent CPU fallback)', async () => {
    const foreign = { ...NEURAL_MODELS[0], url: 'https://cdn.example.com/steal-me.onnx' }
    await expect(
      runNeuralUpscale({ data: new Uint8ClampedArray(4), width: 1, height: 1 }, foreign),
    ).rejects.toMatchObject({
      name: 'NeuralUpscaleError',
      kind: 'cross-origin',
    })
  })
})
