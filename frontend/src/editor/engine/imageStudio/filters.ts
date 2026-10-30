/**
 * Artistic effects — classical image-processing kernels on raw pixel arrays.
 *
 * Every function is pure: it operates on a copy of `Uint8ClampedArray` RGBA data and mutates only
 * that copy, so the caller keeps the pristine source for before/after and unapply. Alpha is always
 * preserved. These are documented classical algorithms (dodge-blend sketching, Sobel line art,
 * threshold stencil, posterised cartoon) — they are filters, not generative models, and the UI
 * labels them as such.
 */

export interface PixelBuffer {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

export type EffectKind = 'sketch' | 'grayscaleSketch' | 'lineArt' | 'ink' | 'stencil' | 'cartoon'

/** Luma of an RGBA tuple (Rec.709). sRGB bytes in, sRGB bytes out; filters stay perceptual. */
function lumaAt(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
}

function cloneBuffer({ data }: PixelBuffer): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray(data)
}

/** Separable box blur on one channel plane — the building block of the sketch blend. */
function boxBlurPlane(plane: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(plane.length)
  const out = new Float32Array(plane.length)
  const norm = 1 / (radius * 2 + 1)
  for (let y = 0; y < height; y++) {
    let acc = 0
    for (let x = -radius; x <= radius; x++) acc += plane[y * width + Math.min(width - 1, Math.max(0, x))]
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = acc * norm
      const outX = Math.min(width - 1, Math.max(0, x - radius))
      const inX = Math.min(width - 1, Math.max(0, x + radius + 1))
      acc += plane[y * width + inX] - plane[y * width + outX]
    }
  }
  for (let x = 0; x < width; x++) {
    let acc = 0
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(height - 1, Math.max(0, y)) * width + x]
    for (let y = 0; y < height; y++) {
      out[y * width + x] = acc * norm
      const outY = Math.min(height - 1, Math.max(0, y - radius))
      const inY = Math.min(height - 1, Math.max(0, y + radius + 1))
      acc += tmp[inY * width + x] - tmp[outY * width + x]
    }
  }
  return out
}

/**
 * Pencil sketch: grayscale -> box-blurred inverted luma -> colour-dodge blend.
 * `mode='grayscale'` constrains the result to pure grey; 'sketch' keeps the dodge result grey too
 * (identical maths — the pencil look is monochrome by construction).
 */
export function pencilSketch(buffer: PixelBuffer, radius = 8, intensity = 1): Uint8ClampedArray<ArrayBuffer> {
  const out = cloneBuffer(buffer)
  const { width, height } = buffer
  const plane = new Float32Array(width * height)
  for (let p = 0, i = 0; p < plane.length; p++, i += 4) plane[p] = Math.min(255, lumaAt(buffer.data, i))
  const blurred = boxBlurPlane(plane, width, height, Math.max(1, Math.round(radius)))
  for (let p = 0, i = 0; p < plane.length; p++, i += 4) {
    const base = plane[p]
    // Colour dodge: result = base * 255 / (255 - (255 - blurred)) = base * 255 / blurred
    const dodge = blurred[p] <= 0.5 ? 255 : Math.min(255, (base * 255) / blurred[p])
    const v = 255 - intensity * (255 - dodge) // intensity blends towards original grey
    out[i] = out[i + 1] = out[i + 2] = v
  }
  return out
}

/** Sobel magnitude map of the luminance plane, drawn as white paper with dark strokes. */
export function lineArt(buffer: PixelBuffer, intensity = 1): Uint8ClampedArray<ArrayBuffer> {
  const out = cloneBuffer(buffer)
  const { width, height, data } = buffer
  const plane = new Float32Array(width * height)
  for (let p = 0, i = 0; p < plane.length; p++, i += 4) plane[p] = lumaAt(data, i)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(width - 1, x + 1)
      const ym = Math.max(0, y - 1), yp = Math.min(height - 1, y + 1)
      const gx =
        plane[y * width + xp] + 2 * plane[yp * width + xp] + plane[yp * width + x] -
        (plane[y * width + xm] + 2 * plane[ym * width + xm] + plane[ym * width + x])
      const gy =
        plane[yp * width + x] + 2 * plane[yp * width + xp] + plane[yp * width + xm] -
        (plane[ym * width + x] + 2 * plane[ym * width + xp] + plane[ym * width + xm])
      const mag = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 720) * intensity
      const i = (y * width + x) * 4
      const stroke = 255 * (1 - mag)
      out[i] = out[i + 1] = out[i + 2] = stroke
    }
  }
  return out
}

/** Black-and-white ink: median-ish bilateral smoothing then hard threshold on luma. */
export function ink(buffer: PixelBuffer, threshold = 0.5, intensity = 1): Uint8ClampedArray<ArrayBuffer> {
  const out = cloneBuffer(buffer)
  const { width, height } = buffer
  const plane = new Float32Array(width * height)
  for (let p = 0, i = 0; p < plane.length; p++, i += 4) plane[p] = lumaAt(out, i) / 255
  const smooth = boxBlurPlane(plane, width, height, 2)
  const t = Math.min(1, Math.max(0, threshold))
  for (let p = 0, i = 0; p < plane.length; p++, i += 4) {
    const soft = smooth[p] * 0.4 + plane[p] * 0.6 // smoothed 40% -> keeps stroke structure
    const v = soft > t ? 255 : 0
    out[i] = out[i + 1] = out[i + 2] = Math.round(255 - intensity * (255 - v))
  }
  return out
}

/** Threshold stencil: pure black/white with no smoothing, razor edges. */
export function stencil(buffer: PixelBuffer, threshold = 0.5): Uint8ClampedArray<ArrayBuffer> {
  const out = cloneBuffer(buffer)
  for (let i = 0; i < out.length; i += 4) {
    const v = lumaAt(out, i) / 255 >= threshold ? 255 : 0
    out[i] = out[i + 1] = out[i + 2] = v
  }
  return out
}

/** Cartoon: posterise colours + darken with Sobel outline; levels 3..12 control flatness. */
export function cartoon(buffer: PixelBuffer, levels = 6, outlineStrength = 0.8): Uint8ClampedArray<ArrayBuffer> {
  const out = cloneBuffer(buffer)
  const { width, height } = buffer
  const safeLevels = Math.max(2, Math.min(12, Math.round(levels)))
  const q = 255 / (safeLevels - 1)
  const plane = new Float32Array(width * height)
  for (let p = 0, i = 0; p < plane.length; p++, i += 4) plane[p] = lumaAt(buffer.data, i)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(width - 1, x + 1)
      const ym = Math.max(0, y - 1), yp = Math.min(height - 1, y + 1)
      const gx = plane[y * width + xp] + 2 * plane[yp * width + xp] + plane[yp * width + x] -
        (plane[y * width + xm] + 2 * plane[ym * width + xm] + plane[ym * width + x])
      const gy = plane[yp * width + x] + 2 * plane[yp * width + xp] + plane[yp * width + xm] -
        (plane[ym * width + x] + 2 * plane[ym * width + xp] + plane[ym * width + xm])
      const edge = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 720)
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c++) {
        const flat = Math.round(out[i + c] / q) * q // posterise
        const darkened = flat * (1 - outlineStrength * edge)
        out[i + c] = Math.round(darkened)
      }
    }
  }
  return out
}

/** Pure grayscale (keeps alpha); the baseline "معامل الرمادي" control. */
export function grayscale(buffer: PixelBuffer): Uint8ClampedArray<ArrayBuffer> {
  const out = cloneBuffer(buffer)
  for (let i = 0; i < out.length; i += 4) {
    const v = lumaAt(out, i)
    out[i] = out[i + 1] = out[i + 2] = v
  }
  return out
}

export interface EffectRunnerOptions {
  strength?: number          // 0..1 blend of the effect over the original
  level?: number             // effect-specific tuning (blur radius / threshold / levels)
  onProgress?: (pct: number) => void
  signal?: AbortSignal
}

/**
 * Generic single-shot application used by the studio: returns a NEW pixel array with
 * effect `kind` applied at `strength`. Chunkability lives in the caller (component yields
 * between rows when it needs to keep the UI responsive).
 */
export function applyEffect(buffer: PixelBuffer, kind: EffectKind, options: EffectRunnerOptions = {}): Uint8ClampedArray<ArrayBuffer> {
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const strength = Math.min(1, Math.max(0, options.strength ?? 1))
  const level = options.level ?? 0.5
  let result: Uint8ClampedArray<ArrayBuffer>
  switch (kind) {
    case 'sketch':
      result = pencilSketch(buffer, 2 + level * 18, strength)
      break
    case 'grayscaleSketch':
      result = pencilSketch(buffer, 2 + level * 26, strength)
      break
    case 'lineArt':
      result = lineArt(buffer, strength)
      break
    case 'ink':
      result = ink(buffer, 0.15 + level * 0.7, strength)
      break
    case 'stencil':
      result = stencil(buffer, 0.1 + level * 0.8)
      break
    case 'cartoon':
      result = cartoon(buffer, Math.max(2, Math.round(3 + level * 9)), 0.4 + level * 0.6)
      break
  }
  // Strength blend when the kernel itself does not already take intensity (stencil/cartoon).
  if ((kind === 'stencil' || kind === 'cartoon' || kind === 'grayscaleSketch') && strength < 1) {
    for (let i = 0; i < result.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        result[i + c] = result[i + c] * strength + buffer.data[i + c] * (1 - strength)
      }
    }
  }
  if (kind === 'sketch' || kind === 'lineArt' || kind === 'ink') {
    // Nothing — those kernels already take strength.
  }
  options.onProgress?.(100)
  return result
}
