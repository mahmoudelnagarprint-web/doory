/**
 * Retouch ops — edge-aware skin smoothing, denoise and selective sharpening on raw pixel arrays.
 *
 * Key algorithm: the smoothing weight falls with *local variance*, preserving real texture
 * (pores, hair, edges) while flattening flat skin zones. This is the property the directive
 * demands: never blur an entire face into wax.
 *
 * All functions are pure (input copy in, mutated copy out) so they are unit-testable and the
 * caller keeps the pristine pixels for before/after and re-application.
 */

import type { PixelBuffer } from './filters'

export interface RetouchOptions {
  intensity?: number      // 0..1 smoothing strength
  texturePreserve?: number // 0..1 — higher keeps more local variance
  signal?: AbortSignal
  onProgress?: (pct: number) => void
}

const luma = (d: Uint8ClampedArray<ArrayBuffer>, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]

/** Small separable box blur of one plane — reused by smoothing and denoise. */
export function blurPlane(plane: Float32Array, width: number, height: number, radius: number): Float32Array {
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
 * Skin smoothing: blur each channel, then blend towards the blur with a weight that decays on
 * high-variance (textured) pixels. `texturePreserve` controls how strongly edges push back.
 */
export function skinSmooth(buffer: PixelBuffer, options: RetouchOptions = {}): Uint8ClampedArray<ArrayBuffer> {
  const { data, width, height } = buffer
  const out = new Uint8ClampedArray(data)
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const intensity = Math.min(1, Math.max(0, options.intensity ?? 0.7))
  const preserve = Math.min(1, Math.max(0, options.texturePreserve ?? 0.65))
  if (intensity <= 0) return out
  const radius = Math.max(1, Math.round(2 + intensity * 8))

  const planes: Float32Array[] = [new Float32Array(width * height), new Float32Array(width * height), new Float32Array(width * height)]
  for (let p = 0, i = 0; p < planes[0].length; p++, i += 4) {
    planes[0][p] = data[i]
    planes[1][p] = data[i + 1]
    planes[2][p] = data[i + 2]
  }
  const blurred = planes.map((plane) => blurPlane(plane, width, height, radius))
  options.onProgress?.(45)

  // Local variance of the luma plane decides where smoothing applies.
  const lumaPlane = new Float32Array(width * height)
  for (let p = 0, i = 0; p < lumaPlane.length; p++, i += 4) lumaPlane[p] = luma(data, i)
  const lumaBlur = blurPlane(lumaPlane, width, height, radius)
  const variance = new Float32Array(width * height)
  for (let p = 0, i = 0; p < variance.length; p++, i += 4) {
    const d = lumaPlane[p] - lumaBlur[p]
    variance[p] = d * d
  }
  // Normalise variance: for 8-bit luma the disparity `d = luma - blurredLuma` stays ~<=25 on photo
  // noise but reaches 100+ on real texture and edges. Dividing by 45^2 maps noise to ~0.3 and
  // strong edges to 1, which is what makes `texturePreserve` actually bite.
  for (let p = 0, i = 0; p < variance.length; p++, i += 4) {
    const flatness = Math.min(1, variance[p] / (45 * 45)) // 0=flat, 1=strong texture
    const w = intensity * (1 - flatness * preserve)
    out[i] = blurred[0][p] + (data[i] - blurred[0][p]) * (1 - w)
    out[i + 1] = blurred[1][p] + (data[i + 1] - blurred[1][p]) * (1 - w)
    out[i + 2] = blurred[2][p] + (data[i + 2] - blurred[2][p]) * (1 - w)
  }
  options.onProgress?.(100)
  return out
}

/**
 * Denoise: radius-2 bilateral on luminance geometry — a cheap standard edge-preserving denoiser.
 * Pixels whose luminance differs strongly from the centre keep their colour.
 */
export function denoise(buffer: PixelBuffer, strength = 0.6): Uint8ClampedArray<ArrayBuffer> {
  const { data, width, height } = buffer
  const out = new Uint8ClampedArray(data)
  const s = Math.min(1, Math.max(0, strength))
  if (s <= 0) return out
  const radius = 2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const cl = luma(data, i)
      let accR = 0, accG = 0, accB = 0, wsum = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = Math.min(height - 1, Math.max(0, y + dy))
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = Math.min(width - 1, Math.max(0, x + dx))
          const j = (ny * width + nx) * 4
          const dl = luma(data, j)
          const w = 1 / (1 + 40 * s * Math.abs(dl - cl) / 255)
          accR += data[j] * w; accG += data[j + 1] * w; accB += data[j + 2] * w; wsum += w
        }
      }
      const blend = s
      out[i] = data[i] + (accR / wsum - data[i]) * blend
      out[i + 1] = data[i + 1] + (accG / wsum - data[i + 1]) * blend
      out[i + 2] = data[i + 2] + (accB / wsum - data[i + 2]) * blend
    }
  }
  return out
}

/**
 * Selective sharpening: unsharp mask gated by edge magnitude — flat zones stay untouched,
 * which is what "selective" means here. This is the honest description of the algorithm.
 */
export function selectiveSharpen(buffer: PixelBuffer, amount = 0.6, edgeGate = 0.12): Uint8ClampedArray<ArrayBuffer> {
  const { data, width, height } = buffer
  const out = new Uint8ClampedArray(data)
  const a = Math.min(2, Math.max(0, amount))
  if (a <= 0) return out
  const plane = new Float32Array(width * height)
  for (let p = 0, i = 0; p < plane.length; p++, i += 4) plane[p] = luma(data, i)
  const blurred = blurPlane(plane, width, height, 1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const detail = plane[p] - blurred[p]
      const gate = Math.min(1, Math.abs(detail) / (edgeGate * 255)) * a
      const delta = detail * gate * 1.4
      const i = p * 4
      for (let c = 0; c < 3; c++) {
        // apply the delta proportionally so relative channel ratios stay intact
        const share = (data[i + c] / Math.max(1, luma(data, i))) * delta
        out[i + c] = data[i + c] + share
      }
    }
  }
  return out
}
