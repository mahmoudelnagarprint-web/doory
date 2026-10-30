import { describe, expect, it } from 'vitest'
import { denoise, selectiveSharpen, skinSmooth } from './retouch'
import type { PixelBuffer } from './filters'

/** 6x6 image of background noise around 128 plus a hard edge column. */
function noisyImage(): PixelBuffer {
  const width = 6
  const height = 6
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(128)
  for (let p = 0; p < width * height; p++) {
    const i = p * 4
    const jitter = ((p * 7919) % 47) - 23 // deterministic pseudo-noise, +-23
    const v = 128 + jitter
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
  }
  for (let y = 0; y < height; y++) { // hard vertical edge: left 128, right 255
    const i = (y * width + 3) * 4
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255
  }
  return { data: data as Uint8ClampedArray<ArrayBuffer>, width, height }
}

const plane = (d: Uint8ClampedArray): number[] => {
  const out: number[] = []
  for (let i = 0; i < d.length; i += 4) out.push(d[i])
  return out
}

const stdevOf = (values: number[]): number => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
}

describe('skinSmooth', () => {
  it('zero intensity is a byte-for-byte no-op', () => {
    const image = noisyImage()
    const out = skinSmooth(image, { intensity: 0 })
    expect(Array.from(out)).toEqual(Array.from(image.data))
  })

  it('reduces noise variance in flat areas (this is the retouch property)', () => {
    const image = noisyImage()
    const out = skinSmooth(image, { intensity: 0.8, texturePreserve: 0.3 })
    expect(stdevOf(plane(out))).toBeLessThan(stdevOf(plane(image.data)))
  })

  it('preserves hard edges when texture preservation is high', () => {
    const image = noisyImage()
    const out = skinSmooth(image, { intensity: 0.9, texturePreserve: 0.95 })
    // The edge pixel (col 3, row 1) stays far from 128: the edge was not dissolved.
    expect(plane(out)[1 * 6 + 3]).toBeGreaterThan(200)
  })

  it('never touches alpha', () => {
    const image = noisyImage()
    image.data[3] = 12 // lone low-alpha pixel
    const out = skinSmooth(image, { intensity: 1 })
    expect(out[3]).toBe(12)
  })
})

describe('denoise', () => {
  it('zero strength is a no-op', () => {
    const image = noisyImage()
    expect(Array.from(denoise(image, 0))).toEqual(Array.from(image.data))
  })

  it('removes luminance noise while keeping the edge step intact', () => {
    const image = noisyImage()
    const out = denoise(image, 0.8)
    expect(stdevOf(plane(out))).toBeLessThan(stdevOf(plane(image.data)))
    expect(plane(out)[1 * 6 + 3]).toBeGreaterThan(170) // edge survives denoising
  })
})

describe('selectiveSharpen', () => {
  it('zero amount is a no-op', () => {
    const image = noisyImage()
    expect(Array.from(selectiveSharpen(image, 0))).toEqual(Array.from(image.data))
  })

  it('sharpens only near edges: the edge flank gets MORE contrast, flat zones stay put', () => {
    const image = noisyImage()
    const out = selectiveSharpen(image, 1)
    // Left flank of the edge (col 2) darkens — the edge contrast grows.
    expect(plane(out)[1 * 6 + 2]).toBeLessThan(plane(image.data)[1 * 6 + 2])
    // A truly flat image has no detail to amplify: byte-for-byte unchanged.
    const flat: PixelBuffer = {
      data: new Uint8ClampedArray(Array.from({ length: 6 * 6 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 128))),
      width: 6,
      height: 6,
    }
    expect(Array.from(selectiveSharpen(flat, 1))).toEqual(Array.from(flat.data))
  })
})
