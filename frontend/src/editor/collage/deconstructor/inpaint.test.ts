import { describe, expect, test } from 'vitest'
import { exemplarInpaintProvider, inpaintExemplar } from './inpaint'
import type { Raster } from './types'

const WIDTH = 120
const HEIGHT = 120

/** The picture is a horizontal gradient, so "close to the surroundings" has an exact expected value. */
function expectedValue(x: number): number {
  return 30 + Math.round((190 * x) / (WIDTH - 1))
}

function gradientRaster(): Raster {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const value = expectedValue(x)
      const at = (y * WIDTH + x) * 4
      data[at] = value
      data[at + 1] = value
      data[at + 2] = value
      data[at + 3] = 255
    }
  }
  return { width: WIDTH, height: HEIGHT, data }
}

/** Byte level difference count; comparing 57 600 element arrays with `toEqual` is needlessly slow. */
function differingBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return -1
  let count = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++
  return count
}

/** Punches a solid black hole through `raster` and returns the mask plus the covered pixel indices. */
function punch(raster: Raster, holes: ReadonlyArray<readonly [number, number]>): { mask: Uint8Array; covered: number[] } {
  const mask = new Uint8Array(raster.width * raster.height)
  const covered: number[] = []
  for (const [x, y] of holes) {
    const index = y * raster.width + x
    mask[index] = 255
    covered.push(index)
    const at = index * 4
    raster.data[at] = 0
    raster.data[at + 1] = 0
    raster.data[at + 2] = 0
    raster.data[at + 3] = 255
  }
  return { mask, covered }
}

function squareHole(hole: { x: number; y: number; size: number }): Array<[number, number]> {
  const pixels: Array<[number, number]> = []
  for (let y = hole.y; y < hole.y + hole.size; y++) {
    for (let x = hole.x; x < hole.x + hole.size; x++) pixels.push([x, y])
  }
  return pixels
}

describe('inpaintExemplar', () => {
  test('rebuilds a square hole from the surrounding gradient', () => {
    const raster = gradientRaster()
    const { mask, covered } = punch(raster, squareHole({ x: 45, y: 45, size: 30 }))
    const inputSnapshot = Uint8ClampedArray.from(raster.data)

    const out = inpaintExemplar(raster, mask)

    // Identity checks compare booleans: `expect(object).not.toBe(...)` makes vitest inspect the whole
    // typed array for its message (~1.3 s per assertion on a 120x120 raster).
    expect(out !== raster).toBe(true)
    expect(out.data !== raster.data).toBe(true)
    expect(out.width).toBe(WIDTH)
    expect(out.height).toBe(HEIGHT)

    // 1. The input raster is never mutated.
    expect(differingBytes(raster.data, inputSnapshot)).toBe(0)

    // 2. Every pixel covered by the mask really changed (none is left black).
    let untouched = 0
    for (const index of covered) {
      const at = index * 4
      if (out.data[at] === 0 && out.data[at + 1] === 0 && out.data[at + 2] === 0) untouched++
    }
    expect(untouched).toBe(0)

    // 3. The fill matches the gradient that surrounds the hole.
    let error = 0
    for (const index of covered) {
      const x = index % WIDTH
      const expected = expectedValue(x)
      const at = index * 4
      error += (Math.abs(out.data[at] - expected) + Math.abs(out.data[at + 1] - expected) + Math.abs(out.data[at + 2] - expected)) / 3
    }
    const meanError = error / covered.length
    expect(meanError).toBeLessThan(1)

    // 4. Pixels outside the mask are byte-for-byte identical to the input.
    let changedOutside = 0
    for (let index = 0; index < WIDTH * HEIGHT; index++) {
      if (mask[index] > 0) continue
      const at = index * 4
      for (let channel = 0; channel < 4; channel++) {
        if (out.data[at + channel] !== inputSnapshot[at + channel]) changedOutside++
      }
    }
    expect(changedOutside).toBe(0)
  })

  test('fills an irregular thin mask completely (no masked pixel is left untouched)', () => {
    const raster = gradientRaster()
    const holes: Array<[number, number]> = []
    for (let y = 20; y < 100; y++) {
      for (let x = 20; x < 100; x++) {
        if (Math.abs(x - y) <= 6) holes.push([x, y])
      }
    }
    const { mask, covered } = punch(raster, holes)
    expect(covered.length).toBeGreaterThan(500)

    const out = inpaintExemplar(raster, mask, { patchRadius: 3, searchRadius: 16 })

    let untouched = 0
    for (const index of covered) {
      const at = index * 4
      if (out.data[at] === 0 && out.data[at + 1] === 0 && out.data[at + 2] === 0) untouched++
    }
    expect(untouched).toBe(0)
  })

  test('an empty mask returns an equal copy, never the input object', () => {
    const raster = gradientRaster()
    const out = inpaintExemplar(raster, new Uint8Array(WIDTH * HEIGHT))
    expect(out !== raster).toBe(true)
    expect(out.data !== raster.data).toBe(true)
    expect(differingBytes(out.data, raster.data)).toBe(0)
  })

  test('reproduces a flat region without inventing texture', () => {
    const data = new Uint8ClampedArray(60 * 60 * 4)
    for (let i = 0; i < 60 * 60; i++) {
      data[i * 4] = 90
      data[i * 4 + 1] = 120
      data[i * 4 + 2] = 150
      data[i * 4 + 3] = 255
    }
    const raster: Raster = { width: 60, height: 60, data }
    const holes: Array<[number, number]> = []
    for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) holes.push([x, y])
    const { mask, covered } = punch(raster, holes)
    const out = inpaintExemplar(raster, mask)
    for (const index of covered) {
      const at = index * 4
      expect(out.data[at]).toBe(90)
      expect(out.data[at + 1]).toBe(120)
      expect(out.data[at + 2]).toBe(150)
    }
  })
})

describe('exemplarInpaintProvider', () => {
  test('is the classical engine and returns a genuinely new raster', async () => {
    expect(exemplarInpaintProvider.id).toBe('exemplar')
    expect(exemplarInpaintProvider.neural).toBe(false)
    await expect(exemplarInpaintProvider.isAvailable()).resolves.toBe(true)

    const raster = gradientRaster()
    const { mask, covered } = punch(raster, squareHole({ x: 50, y: 50, size: 20 }))
    const snapshot = Uint8ClampedArray.from(raster.data)
    const out = await exemplarInpaintProvider.inpaint(raster, mask)
    expect(out !== raster).toBe(true)
    expect(differingBytes(raster.data, snapshot)).toBe(0)
    const sample = covered[Math.floor(covered.length / 2)]
    expect(out.data[sample * 4]).toBeGreaterThan(0)
  })
})
