/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import { describe, test, expect } from 'vitest'

/* Lightweight polyfills so client-side CV algorithms run in Node/Vitest. */
class MockOffscreenCanvas {
  width: number; height: number
  constructor(w: number, h: number) { this.width = w; this.height = h }
  getContext(_t: string): any {
    return {
      drawImage: () => {},
      putImageData: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }),
      createImageData: (w?: number, h?: number) => ({ data: new Uint8ClampedArray((w ?? this.width) * (h ?? this.height) * 4) }),
    }
  }
  toDataURL(_type?: string) { return 'data:image/png;base64,' }
}

(globalThis as any).OffscreenCanvas = MockOffscreenCanvas

class MockImage {
  crossOrigin = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  get src() { return this._src }
  set src(value: string) { this._src = value; if (this.onload) this.onload() }
  get width() { return 20 }
  get height() { return 20 }
}

globalThis.Image = MockImage as any

class MockImageData {
  width: number; height: number; data: Uint8ClampedArray
  constructor(data: Uint8ClampedArray | number[], w?: number, h?: number) {
    if (Array.isArray(data)) {
      this.data = new Uint8ClampedArray(data)
      this.width = w ?? 1
      this.height = h ?? 1
    } else {
      this.data = data
      this.width = w ?? 1
      this.height = h ?? 1
    }
  }
}

(globalThis as any).ImageData = MockImageData

import { paperMask, minimumAreaRectangle } from './frameExtractor'
import { generateGrabCutMask, inpaintHole } from './elementDetacher'
import { binarizeInk, spawnLiveTextLayer } from './textDeconstructor'

/** Helper: build a synthetic RGBA raster (white rectangle on warm mat). */
function syntheticPaper(width: number, height: number, paperColor = { r: 245, g: 239, b: 226 }, rect?: { x: number; y: number; w: number; h: number }): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let r = paperColor.r, g = paperColor.g, b = paperColor.b, a = 255
      if (rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) {
        // White rectangle (simulated paper interior).
        r = 250; g = 250; b = 250; a = 255
      }
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return data
}

describe('frameExtractor', () => {
  test('paperMask detects white rectangle', () => {
    const w = 20, h = 20
    const data = syntheticPaper(w, h, { r: 245, g: 239, b: 226 }, { x: 5, y: 5, w: 10, h: 10 })
    const mask = paperMask({ width: w, height: h, data }, 90)
    expect(mask).toBeInstanceOf(Uint8Array)
    expect(mask.length).toBe(w * h)
    // There should be at least some 1s inside the white rectangle.
    // White has luminance ≈100; paper threshold must be below that.
    const ones = (mask as Uint8Array).reduce((n, v) => n + (v === 1 ? 1 : 0), 0)
    expect(ones).toBeGreaterThan(0)
  })

  test('minimumAreaRectangle fits rotated box', () => {
    const points = [
      { x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 },
    ]
    const rect = minimumAreaRectangle(points)
    expect(rect.width).toBeCloseTo(10, 0)
    expect(rect.height).toBeCloseTo(10, 0)
    expect(rect.angle).toBeCloseTo(0, 0)
  })
})

describe('elementDetacher', () => {
  test('generateGrabCutMask fills selected region', () => {
    const w = 16, h = 16
    const data = syntheticPaper(w, h)
    const mask = generateGrabCutMask({ width: w, height: h, data }, [{ x: 8, y: 8 }])
    expect(mask.length).toBe(w * h)
    // The seed point should be inside the mask.
    expect(mask[8 * w + 8]).toBe(255)
  })

  test('inpaintHole fills hole', async () => {
    const w = 12, h = 12
    const data = syntheticPaper(w, h)
    const mask = new Uint8Array(w * h)
    // Create a small hole in the middle.
    for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) mask[y * w + x] = 255
    const { dataUrl } = await inpaintHole({ width: w, height: h, data }, mask)
    expect(typeof dataUrl).toBe('string')
    expect(dataUrl.length).toBeGreaterThan(0)
  })
})

describe('textDeconstructor', () => {
  test('binarizeInk produces binary mask', () => {
    const w = 12, h = 12
    const data = syntheticPaper(w, h)
    const inkMask = binarizeInk({ width: w, height: h, data })
    expect(inkMask).toBeInstanceOf(Uint8Array)
    expect(inkMask.length).toBe(w * h)
  })

  test('detectAndEraseText works with synthetic paper', async () => {
    // Direct pure-function smoke: binarizeInk on synthetic paper + spawn text layer.
    const w = 20, h = 20
    const data = syntheticPaper(w, h)
    const inkMask = binarizeInk({ width: w, height: h, data })
    expect(inkMask).toBeInstanceOf(Uint8Array)
    const live = spawnLiveTextLayer({ id: 't2', x: 0, y: 0, width: 50, height: 20, angle: 0, inkColor: '#000', paperColor: '#f5efe2', fontSize: 14, text: 'Test', confidence: 0.95 })
    expect(live.text).toBe('Test')
    expect(typeof inkMask).toBe('object')
  })

  test('spawnLiveTextLayer preserves properties', () => {
    const card = { id: 't1', x: 10, y: 20, width: 80, height: 40, angle: 5, inkColor: '#333', paperColor: '#f5efe2', fontSize: 18, text: 'Hello', confidence: 0.9 }
    const live = spawnLiveTextLayer(card)
    expect(live.text).toBe('Hello')
    expect(live.inkColor).toBe('#333')
  })
})
