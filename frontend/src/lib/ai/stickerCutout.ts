/**
 * Sticker cutout engine — zero-API-key subject isolation for the Sticker Studio.
 *
 * Two modes behind one entry point (`createStickerCutout`):
 *
 * - **Mode A "neural"** — the editor's own background-removal pipeline
 *   (`src/editor/engine/bgRemoval`): an on-device WASM/ONNX segmenter running in a
 *   worker (or a server model when one is configured). No API keys. The heavy engine
 *   chunk only loads when a neural cutout actually runs, so importing this module is
 *   free for the bundle budget.
 * - **Mode B "studio"** — a pure-canvas alpha-matting pass for flat / solid /
 *   already-transparent backgrounds and for fast batches: corner-seeded tolerance
 *   flood fill (interior holes stay, because seeds only sit on the border), colour
 *   decontamination of edge pixels, alpha choke and Gaussian feather to kill white
 *   halos, then a tight auto-crop of the transparent bounds.
 *
 * Every raster helper works on a structural `PixelBuffer` (anything shaped like
 * `ImageData`), so the maths is unit-testable without a DOM canvas.
 */

import { isBackgroundRemovalAvailable, removeBackground } from '@/editor/engine/bgRemoval'

/** Anything `ImageData`-shaped; lets tests build buffers without a canvas. */
export interface PixelBuffer {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** DOM's `ImageData` wants an ArrayBuffer-backed view; our buffers are copies, so cast once here. */
export function toImageData(buffer: PixelBuffer): ImageData {
  return new ImageData(buffer.data as Uint8ClampedArray<ArrayBuffer>, buffer.width, buffer.height)
}

export type CutoutMode = 'neural' | 'studio'
export type CutoutModeChoice = CutoutMode | 'auto'
export type CutoutPhase = 'loading' | 'segmenting' | 'matting' | 'finalizing'

export type CutoutProgress = (phase: CutoutPhase, percent: number) => void

export interface CutoutSettings {
  /** `'auto'` picks per image: flat border → studio, busy photo → neural. Default `auto`. */
  mode?: CutoutModeChoice
  /** Flood-fill colour tolerance against the sampled border colour (8..120). Default 40. */
  tolerance?: number
  /** Erodes (positive) or grows (negative) the alpha edge in pixels (-10..10). Default 0. */
  edgeChoke?: number
  /** Gaussian-style feather of the alpha edge in pixels (0..10). Default 1. */
  edgeFeather?: number
  /** Working-resolution cap on the longest side; stickers never need more. Default 2048. */
  maxWorkSize?: number
  signal?: AbortSignal
  onProgress?: CutoutProgress
}

export interface CutoutResult {
  dataUrl: string
  width: number
  height: number
  mode: CutoutMode
}

export class CutoutError extends Error {
  constructor(message: string, readonly reason: 'aborted' | 'decode' | 'unavailable' | 'empty' = 'unavailable') {
    super(message)
    this.name = 'CutoutError'
  }
}

/* ------------------------------------------------------------------ loading */

/** Decodes a blob (or data URL) into pixels, capped to `maxWorkSize` on the long side. */
export async function blobToPixelBuffer(source: Blob | string, maxWorkSize = 2048, signal?: AbortSignal): Promise<PixelBuffer> {
  const bitmap = await decodeToDrawable(source, signal)
  throwIfAborted(signal)
  const scale = Math.min(1, maxWorkSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new CutoutError('This browser cannot process images.', 'decode')
  ctx.drawImage(bitmap, 0, 0, width, height)
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()
  const image = ctx.getImageData(0, 0, width, height)
  return { data: image.data, width, height }
}

async function decodeToDrawable(source: Blob | string, signal?: AbortSignal): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof source === 'string' && !source.startsWith('data:')) {
    const response = await fetch(source)
    if (!response.ok) throw new CutoutError(`Could not read the image (HTTP ${response.status}).`, 'decode')
    source = await response.blob()
  }
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source instanceof Blob ? source : await (await fetch(source)).blob())
    } catch {
      // fall through to the <img> path (some engines refuse odd formats here)
    }
  }
  return await decodeViaImageElement(source, signal)
}

function decodeViaImageElement(source: Blob | string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = source instanceof Blob ? URL.createObjectURL(source) : source
    const image = new Image()
    const cleanup = (): void => {
      if (source instanceof Blob) URL.revokeObjectURL(url)
    }
    image.onload = () => {
      cleanup()
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new CutoutError('The image could not be decoded.', 'decode'))
    }
    signal?.addEventListener('abort', () => {
      cleanup()
      reject(new CutoutError('Cancelled.', 'aborted'))
    }, { once: true })
    image.src = url
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CutoutError('Cancelled.', 'aborted')
}

/** Encodes pixels as a PNG data URL (alpha preserved). */
export function pixelBufferToPngDataUrl(buffer: PixelBuffer): string {
  const canvas = document.createElement('canvas')
  canvas.width = buffer.width
  canvas.height = buffer.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new CutoutError('This browser cannot process images.', 'decode')
  ctx.putImageData(toImageData(buffer), 0, 0)
  return canvas.toDataURL('image/png')
}

/* ------------------------------------------------------- background sampling */

export interface BorderSample {
  color: [number, number, number]
  /** Fraction of opaque border pixels already transparent (0..1). */
  transparentFraction: number
}

/**
 * Samples the image border and returns the dominant background colour (per-channel
 * median) plus how much of the border is already transparent.
 */
export function sampleBorder(buffer: PixelBuffer): BorderSample {
  const { data, width, height } = buffer
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  let transparent = 0
  let total = 0
  const step = Math.max(1, Math.floor(Math.max(width, height) / 256))
  const push = (x: number, y: number): void => {
    const i = (y * width + x) * 4
    const a = data[i + 3]
    total += 1
    if (a < 16) {
      transparent += 1
      return
    }
    rs.push(data[i])
    gs.push(data[i + 1])
    bs.push(data[i + 2])
  }
  for (let x = 0; x < width; x += step) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += step) {
    push(0, y)
    push(width - 1, y)
  }
  const median = (values: number[]): number => {
    if (values.length === 0) return 255
    const sorted = values.slice().sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }
  return {
    color: [median(rs), median(gs), median(bs)],
    transparentFraction: total > 0 ? transparent / total : 0,
  }
}

/** Distance² between two RGB triples. */
function colorDistance2(a: [number, number, number], r: number, g: number, b: number): number {
  const dr = a[0] - r
  const dg = a[1] - g
  const db = a[2] - b
  return dr * dr + dg * dg + db * db
}

/* ------------------------------------------------------------ mode detection */

/**
 * Auto mode: a border that is one flat colour (or already mostly transparent) is
 * studio territory — instant and exact. Anything busier needs the neural model.
 */
export function autoDetectMode(buffer: PixelBuffer, tolerance = 40): CutoutMode {
  const sample = sampleBorder(buffer)
  if (sample.transparentFraction >= 0.3) return 'studio'
  const { data, width, height } = buffer
  const limit = (tolerance + 4) * (tolerance + 4) * 3
  const step = Math.max(1, Math.floor(Math.max(width, height) / 256))
  let matching = 0
  let total = 0
  const check = (x: number, y: number): void => {
    const i = (y * width + x) * 4
    if (data[i + 3] < 16) return
    total += 1
    if (colorDistance2(sample.color, data[i], data[i + 1], data[i + 2]) <= limit) matching += 1
  }
  for (let x = 0; x < width; x += step) {
    check(x, 0)
    check(x, height - 1)
  }
  for (let y = 0; y < height; y += step) {
    check(0, y)
    check(width - 1, y)
  }
  return total > 0 && matching / total >= 0.9 ? 'studio' : 'neural'
}

/* -------------------------------------------------------------- studio cutout */

/**
 * Mode B: alpha matting for flat backgrounds.
 *
 * 1. Flood fill from every border pixel that matches the sampled background within
 *    `tolerance` — 4-connected, so interior holes never leak (no seed touches them).
 * 2. Decontaminate semi-matching edge colours (kills the white fringe).
 * 3. `edgeChoke` erodes (or grows) the mask; `edgeFeather` feathers it.
 */
export function studioCutout(source: PixelBuffer, options: { tolerance?: number; edgeChoke?: number; edgeFeather?: number } = {}): PixelBuffer {
  const tolerance = clamp(options.tolerance ?? 40, 8, 120)
  const choke = clamp(options.edgeChoke ?? 0, -10, 10)
  const feather = clamp(options.edgeFeather ?? 1, 0, 10)
  const { width, height } = source
  const data = new Uint8ClampedArray(source.data)
  const sample = sampleBorder(source)
  const alreadyTransparent = sample.transparentFraction >= 0.3
  const limit = tolerance * tolerance * 3

  // 1 + 2: flood fill the border-connected background; soften matching edge pixels.
  const visited = new Uint8Array(width * height)
  const stack: number[] = []
  const seed = (index: number): void => {
    if (visited[index]) return
    const i = index * 4
    if (data[i + 3] < 16) {
      visited[index] = 1
      return
    }
    if (colorDistance2(sample.color, data[i], data[i + 1], data[i + 2]) > limit) return
    visited[index] = 1
    stack.push(index)
  }
  for (let x = 0; x < width; x++) {
    seed(x)
    seed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    seed(y * width)
    seed(y * width + width - 1)
  }
  while (stack.length > 0) {
    const index = stack.pop() as number
    const x = index % width
    const y = (index - x) / width
    if (x > 0) seed(index - 1)
    if (x < width - 1) seed(index + 1)
    if (y > 0) seed(index - width)
    if (y < height - 1) seed(index + width)
  }

  const a = sample.color[0] / 255
  const g0 = sample.color[1] / 255
  const b0 = sample.color[2] / 255
  const softLimit = limit * 1.6
  for (let index = 0; index < width * height; index++) {
    const i = index * 4
    if (visited[index]) {
      data[i + 3] = 0
      continue
    }
    if (alreadyTransparent) continue
    // Colour decontamination: pixels between the subject and the flood edge carry a
    // background wash; pull it back out so the kept edge has no halo.
    const dist2 = colorDistance2(sample.color, data[i], data[i + 1], data[i + 2])
    if (dist2 > limit && dist2 <= softLimit && data[i + 3] === 255) {
      const w = 1 - (dist2 - limit) / (softLimit - limit)
      const alpha = 1 - 0.75 * w
      data[i] = clamp255((data[i] / 255 - (1 - alpha) * a) / alpha * 255)
      data[i + 1] = clamp255((data[i + 1] / 255 - (1 - alpha) * g0) / alpha * 255)
      data[i + 2] = clamp255((data[i + 2] / 255 - (1 - alpha) * b0) / alpha * 255)
      data[i + 3] = clamp255(alpha * 255)
    }
  }

  if (choke !== 0) morphAlpha(data, width, height, choke)
  if (feather > 0) featherAlpha(data, width, height, feather)
  let visible = false
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) {
      visible = true
      break
    }
  }
  if (!visible) throw new CutoutError('Nothing is left after removing the background.', 'empty')
  return { data, width, height }
}

/* ---------------------------------------------------------- alpha operations */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value
}

/** Erodes (`px > 0`) or dilates (`px < 0`) the alpha channel with a separable min/max filter. */
export function morphAlpha(data: Uint8ClampedArray, width: number, height: number, px: number): void {
  const radius = Math.round(Math.abs(px))
  if (radius <= 0) return
  const grow = px < 0
  const horizontal = new Uint8ClampedArray(data.length)
  const offset = grow ? radius : -radius
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let extreme = data[(row + x) * 4 + 3]
      for (let d = -radius; d <= radius; d++) {
        const sx = clamp(x + d, 0, width - 1)
        const value = data[(row + sx) * 4 + 3]
        extreme = grow ? Math.max(extreme, value) : Math.min(extreme, value)
      }
      horizontal[(row + x) * 4 + 3] = extreme
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let extreme = horizontal[((clamp(y + offset, 0, height - 1)) * width + x) * 4 + 3]
      for (let d = -radius; d <= radius; d++) {
        const sy = clamp(y + d, 0, height - 1)
        const value = horizontal[(sy * width + x) * 4 + 3]
        extreme = grow ? Math.max(extreme, value) : Math.min(extreme, value)
      }
      data[(y * width + x) * 4 + 3] = extreme
    }
  }
}

/** Gaussian-ish feather of the alpha edge: two box-blur passes, then a smooth remap. */
export function featherAlpha(data: Uint8ClampedArray, width: number, height: number, radiusPx: number): void {
  const radius = Math.max(1, Math.round(radiusPx))
  const alpha = new Float32Array(width * height)
  for (let index = 0; index < width * height; index++) alpha[index] = data[index * 4 + 3]
  const blurred = boxBlurFloat(boxBlurFloat(alpha, width, height, radius), width, height, radius)
  for (let index = 0; index < width * height; index++) {
    const a = blurred[index] / 255
    // Smoothstep keeps solid interiors at 255 while the band gets a soft gradient.
    const shaped = a <= 0.25 ? 0 : a >= 0.75 ? 1 : (x => x * x * (3 - 2 * x))((a - 0.25) / 0.5)
    data[index * 4 + 3] = clamp255(shaped * 255)
  }
}

function boxBlurFloat(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const out = new Float32Array(src.length)
  const window = radius * 2 + 1
  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    for (let d = -radius; d <= radius; d++) sum += src[row + clamp(d, 0, width - 1)]
    for (let x = 0; x < width; x++) {
      out[row + x] = sum / window
      const adding = src[row + clamp(x + radius + 1, 0, width - 1)]
      const removing = src[row + clamp(x - radius, 0, width - 1)]
      sum += adding - removing
    }
  }
  const out2 = new Float32Array(src.length)
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let d = -radius; d <= radius; d++) sum += out[clamp(d, 0, height - 1) * width + x]
    for (let y = 0; y < height; y++) {
      out2[y * width + x] = sum / window
      const adding = out[clamp(y + radius + 1, 0, height - 1) * width + x]
      const removing = out[clamp(y - radius, 0, height - 1) * width + x]
      sum += adding - removing
    }
  }
  return out2
}

/* ------------------------------------------------------------- auto cropping */

export interface CropBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Bounding box of every visible (alpha ≥ `threshold`) pixel, padded, clamped to the buffer. */
export function transparentBounds(buffer: PixelBuffer, threshold = 2, pad = 0): CropBounds {
  const { data, width, height } = buffer
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (data[(row + x) * 4 + 3] >= threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width, height }
  minX = clamp(minX - pad, 0, width - 1)
  minY = clamp(minY - pad, 0, height - 1)
  maxX = clamp(maxX + pad, 0, width - 1)
  maxY = clamp(maxY + pad, 0, height - 1)
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** Crops the buffer to the visible artwork so the saved sticker hugs it tightly. */
export function autoCropTransparentBounds(buffer: PixelBuffer, pad = 0): PixelBuffer {
  const bounds = transparentBounds(buffer, 2, pad)
  if (bounds.width === buffer.width && bounds.height === buffer.height) return buffer
  const data = new Uint8ClampedArray(bounds.width * bounds.height * 4)
  for (let y = 0; y < bounds.height; y++) {
    const from = ((y + bounds.y) * buffer.width + bounds.x) * 4
    data.set(buffer.data.subarray(from, from + bounds.width * 4), y * bounds.width * 4)
  }
  return { data, width: bounds.width, height: bounds.height }
}

/* ------------------------------------------------------------------ brushes */

export type BrushMode = 'erase' | 'restore'

/**
 * Stamps one brush dab onto `target`.
 *
 * - `erase` pushes alpha toward 0.
 * - `restore` pulls pixels back from `source` (original colour **and** full alpha).
 * `softness` 0 = hard circle, 1 = fully feathered falloff.
 */
export function brushStroke(target: PixelBuffer, source: PixelBuffer, cx: number, cy: number, radius: number, softness: number, mode: BrushMode): void {
  const r = Math.max(0.5, radius)
  const feather = clamp(softness, 0, 1)
  const inner = r * (1 - feather * 0.85)
  const x0 = Math.max(0, Math.floor(cx - r))
  const x1 = Math.min(target.width - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const y1 = Math.min(target.height - 1, Math.ceil(cy + r))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > r) continue
      const falloff = dist <= inner ? 1 : 1 - (dist - inner) / Math.max(0.001, r - inner)
      const weight = falloff * falloff
      const i = (y * target.width + x) * 4
      if (mode === 'erase') {
        target.data[i + 3] = clamp255(target.data[i + 3] * (1 - weight))
      } else {
        const s = (y * source.width + x) * 4
        target.data[i] = source.data[s]
        target.data[i + 1] = source.data[s + 1]
        target.data[i + 2] = source.data[s + 2]
        target.data[i + 3] = clamp255(target.data[i + 3] + (255 - target.data[i + 3]) * weight)
      }
    }
  }
}

/** Global post-controls the refine studio re-applies on top of the painted mask. */
export function applyEdgeControls(buffer: PixelBuffer, edgeChoke: number, edgeFeather: number): PixelBuffer {
  const data = new Uint8ClampedArray(buffer.data)
  if (edgeChoke !== 0) morphAlpha(data, buffer.width, buffer.height, clamp(edgeChoke, -10, 10))
  if (edgeFeather > 0) featherAlpha(data, buffer.width, buffer.height, clamp(edgeFeather, 0, 10))
  return { data, width: buffer.width, height: buffer.height }
}

export interface DieCutOptions {
  /** Contour width in pixels (0..24). */
  borderPx: number
  /** Contour colour, `#rrggbb`. */
  color: string
  /** Optional drop shadow behind the whole sticker. */
  shadow?: boolean
}

/**
 * Die-cut border: grows the alpha silhouette, paints it in `color` behind the
 * artwork and (optionally) adds a soft drop shadow — the classic sticker look.
 */
export function applyDieCutBorder(buffer: PixelBuffer, options: DieCutOptions): PixelBuffer {
  const borderPx = clamp(Math.round(options.borderPx), 0, 24)
  if (borderPx <= 0 && !options.shadow) return buffer
  const pad = borderPx + (options.shadow ? Math.ceil(borderPx * 0.5 + 4) : 0)
  const width = buffer.width + pad * 2
  const height = buffer.height + pad * 2
  const out = new Uint8ClampedArray(width * height * 4)
  const [r, g, b] = hexToRgb(options.color)
  const grow = (strength: number): void => {
    // Dilate on the ENLARGED grid so the contour wraps around the artwork instead
    // of stopping at its bounds (blur-threshold dilation keeps it round).
    const mask = new Float32Array(width * height)
    for (let y = 0; y < buffer.height; y++) {
      for (let x = 0; x < buffer.width; x++) {
        mask[(y + pad) * width + (x + pad)] = buffer.data[(y * buffer.width + x) * 4 + 3]
      }
    }
    const soft = boxBlurFloat(boxBlurFloat(mask, width, height, Math.max(1, borderPx)), width, height, Math.max(1, borderPx))
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = soft[y * width + x] / 255
        if (value < 0.02) continue
        const o = (y * width + x) * 4
        const coverage = clamp255(value * strength * 255)
        if (coverage > out[o + 3]) {
          out[o] = r
          out[o + 1] = g
          out[o + 2] = b
          out[o + 3] = coverage
        }
      }
    }
  }
  if (options.shadow) {
    const shadowOffset = Math.max(1, Math.round(borderPx * 0.35) + 1)
    const shifted = new Uint8ClampedArray(buffer.data)
    morphAlpha(shifted, buffer.width, buffer.height, -2)
    const shadowSource: PixelBuffer = { data: shifted, width: buffer.width, height: buffer.height }
    const shadowMask = new Float32Array(buffer.width * buffer.height)
    for (let index = 0; index < shadowMask.length; index++) shadowMask[index] = shadowSource.data[index * 4 + 3]
    const soft = boxBlurFloat(boxBlurFloat(shadowMask, buffer.width, buffer.height, Math.max(1, Math.round(borderPx * 0.6) + 1)), buffer.width, buffer.height, Math.max(1, Math.round(borderPx * 0.6) + 1))
    for (let y = 0; y < buffer.height; y++) {
      for (let x = 0; x < buffer.width; x++) {
        const value = soft[y * buffer.width + x] / 255
        if (value < 0.02) continue
        const o = ((y + pad + shadowOffset) * width + (x + pad + shadowOffset)) * 4
        const coverage = clamp255(value * 110)
        if (coverage > out[o + 3]) {
          out[o] = 0
          out[o + 1] = 0
          out[o + 2] = 0
          out[o + 3] = coverage
        }
      }
    }
  }
  if (borderPx > 0) grow(1)
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      const s = (y * buffer.width + x) * 4
      if (buffer.data[s + 3] === 0) continue
      const o = ((y + pad) * width + (x + pad)) * 4
      out[o] = buffer.data[s]
      out[o + 1] = buffer.data[s + 1]
      out[o + 2] = buffer.data[s + 2]
      out[o + 3] = buffer.data[s + 3]
    }
  }
  return { data: out, width, height }
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const int = parseInt(full, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

/* ------------------------------------------------------------- entry points */

/** Runs one neural cutout through the editor's own zero-key pipeline. */
export async function neuralCutout(source: Blob, signal?: AbortSignal, onProgress?: CutoutProgress): Promise<PixelBuffer> {
  if (!isBackgroundRemovalAvailable()) throw new CutoutError('The neural engine is not available in this session.', 'unavailable')
  onProgress?.('segmenting', 0)
  const png = await removeBackground(source, (phase, percent) => onProgress?.(phase === 'downloading' ? 'loading' : 'segmenting', percent), signal)
  throwIfAborted(signal)
  return await blobToPixelBuffer(png, 2048, signal)
}

/**
 * One-call sticker cutout: decode → (auto-)pick a mode → isolate → auto-crop → PNG.
 * Neural failures degrade to the studio matting so a batch never dead-ends.
 */
export async function createStickerCutout(source: Blob, settings: CutoutSettings = {}): Promise<CutoutResult> {
  const { signal, onProgress } = settings
  onProgress?.('loading', 0)
  const buffer = await blobToPixelBuffer(source, settings.maxWorkSize ?? 2048, signal)
  throwIfAborted(signal)
  onProgress?.('loading', 100)

  let mode: CutoutMode
  const choice = settings.mode ?? 'auto'
  if (choice === 'auto') {
    mode = autoDetectMode(buffer, settings.tolerance)
    if (mode === 'neural' && !isBackgroundRemovalAvailable()) mode = 'studio'
  } else {
    mode = choice
  }

  let cut: PixelBuffer
  if (mode === 'neural') {
    try {
      cut = await neuralCutout(source, signal, onProgress)
    } catch (error) {
      if (signal?.aborted) throw new CutoutError('Cancelled.', 'aborted')
      if (error instanceof CutoutError) throw error
      mode = 'studio' // degrade, never dead-end
      cut = studioCutout(buffer, settings)
    }
  } else {
    onProgress?.('matting', 10)
    if (signal?.aborted) throw new CutoutError('Cancelled.', 'aborted')
    cut = studioCutout(buffer, settings)
    onProgress?.('matting', 100)
  }

  onProgress?.('finalizing', 30)
  const cropped = autoCropTransparentBounds(cut, 1)
  throwIfAborted(signal)
  const dataUrl = pixelBufferToPngDataUrl(cropped)
  onProgress?.('finalizing', 100)
  return { dataUrl, width: cropped.width, height: cropped.height, mode }
}
