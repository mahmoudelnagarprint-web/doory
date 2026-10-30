/**
 * Design Decomposer — mask operations.
 *
 * Every function here is DOM-free: plain `Uint8Array` / `Uint8ClampedArray` maths on a one byte per
 * pixel coverage mask (`0` = outside the element, `255` = fully inside). That is what lets the whole
 * decomposition be unit-tested in jsdom, where there is no canvas at all.
 *
 * Conventions used throughout:
 *  - a mask is binary (`0` or `255`) unless the function says it produces soft coverage
 *    (`featherMask`, `resizeMask`, `grayscale`).
 *  - morphology uses a square structuring element of radius `radius` (side `2 * radius + 1`) and is
 *    separable: a column pass after a row pass, each an O(n) sliding window extremum. Erosion is the
 *    minimum filter, dilation the maximum filter, so `openMask` removes speckles and `closeMask`
 *    bridges gaps — both are the genuine morphological operations, not windowed thresholds.
 *    The structuring element is clipped at the image border (pixels outside are ignored rather than
 *    treated as background), so an element touching the edge is not eaten away by an opening.
 *
 * Return types: `Uint8Array<ArrayBuffer>` is the same type as `Uint8Array`/`PixelMask` for every
 * caller, but the buffer parameter is pinned because every function here allocates its own buffer and
 * this project's TypeScript library makes bare `Uint8Array` mean `Uint8Array<ArrayBufferLike>`, which
 * cannot be assigned back into a variable initialised as `new Uint8Array(n)`.
 */
import type { PixelMask, PixelRect, Raster } from './types'

/** Distance used to compare RGB colours: the largest per channel difference, 0..255. */
export type ColorDistance = 'chebyshev'

/** Converts per pixel probabilities / coverage into a binary mask (`>= threshold` becomes 255). */
export function binarize(prob: Uint8Array, threshold: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(prob.length)
  for (let i = 0; i < prob.length; i++) out[i] = prob[i] >= threshold ? 255 : 0
  return out
}

/**
 * Sliding window extremum of one line.
 *
 * `out[i]` is the minimum (or maximum) of `values[i - radius .. i + radius]`, clipped to the line.
 * The window is centred, so the line is walked `radius` positions past its end while the monotonic
 * deque holds the candidates: every position is pushed and popped at most once, which makes the whole
 * pass O(count) instead of O(count * radius).
 */
function centeredExtreme(
  values: ArrayLike<number>,
  count: number,
  radius: number,
  wantMax: boolean,
  out: Uint8Array,
): void {
  if (radius <= 0) {
    for (let i = 0; i < count; i++) out[i] = values[i]
    return
  }
  const deque = new Int32Array(count)
  let head = 0
  let tail = 0
  const span = 2 * radius + 1
  for (let k = 0; k < count + radius; k++) {
    if (k < count) {
      const value = values[k]
      while (tail > head) {
        const back = values[deque[tail - 1]]
        if (wantMax ? back <= value : back >= value) tail--
        else break
      }
      deque[tail++] = k
    }
    const left = k - span + 1
    while (deque[head] < left) head++
    const i = k - radius
    if (i >= 0 && i < count) out[i] = values[deque[head]]
  }
}

/** Separable square-window morphology: `wantMax` false = erosion, true = dilation. */
function boxMorph(mask: Uint8Array, width: number, height: number, radius: number, wantMax: boolean): Uint8Array<ArrayBuffer> {
  const r = Math.max(0, Math.floor(radius))
  const out = new Uint8Array(mask.length)
  if (mask.length !== width * height || width <= 0 || height <= 0) return out
  if (r === 0) {
    out.set(mask)
    return out
  }
  const longest = Math.max(width, height)
  const line = new Uint8Array(longest)
  const blurred = new Uint8Array(longest)
  const horizontal = new Uint8Array(mask.length)

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) line[x] = mask[row + x]
    centeredExtreme(line, width, r, wantMax, blurred)
    for (let x = 0; x < width; x++) horizontal[row + x] = blurred[x]
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) line[y] = horizontal[y * width + x]
    centeredExtreme(line, height, r, wantMax, blurred)
    for (let y = 0; y < height; y++) out[y * width + x] = blurred[y]
  }
  return out
}

/** Erosion: a pixel survives only when its whole `radius` square neighbourhood is inside the mask. */
export function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array<ArrayBuffer> {
  return boxMorph(mask, width, height, radius, false)
}

/** Dilation: a pixel joins the mask when any pixel of its `radius` square neighbourhood is inside it. */
export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array<ArrayBuffer> {
  return boxMorph(mask, width, height, radius, true)
}

/** Opening (erode then dilate): removes specks and thin bridges, keeps the overall shape. */
export function openMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array<ArrayBuffer> {
  return dilate(erode(mask, width, height, radius), width, height, radius)
}

/** Closing (dilate then erode): fills small gaps and pinholes inside the shape. */
export function closeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array<ArrayBuffer> {
  return erode(dilate(mask, width, height, radius), width, height, radius)
}

/**
 * Fills enclosed background. The border is flood filled first (4-connected, so a one pixel diagonal
 * touch does not let the outside in); every background pixel the flood never reaches is enclosed by
 * the mask and becomes foreground. The outer background therefore stays background.
 */
export function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer> {
  const total = width * height
  const out = new Uint8Array(mask.length)
  if (mask.length !== total || total <= 0) return out
  for (let i = 0; i < total; i++) out[i] = mask[i] > 0 ? 255 : 0

  const reached = new Uint8Array(total)
  const stack = new Int32Array(total)
  let top = 0
  const push = (index: number): void => {
    if (!reached[index] && out[index] === 0) {
      reached[index] = 1
      stack[top++] = index
    }
  }
  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }
  while (top > 0) {
    const index = stack[--top]
    const x = index % width
    const y = (index - x) / width
    if (x > 0) push(index - 1)
    if (x + 1 < width) push(index + 1)
    if (y > 0) push(index - width)
    if (y + 1 < height) push(index + width)
  }
  for (let i = 0; i < total; i++) if (out[i] === 0 && !reached[i]) out[i] = 255
  return out
}

/**
 * Genuine soft edge: a separable box blur of the binary mask (a `2r+1` box in x, then in y), which
 * turns a hard step into a linear ramp of width `2r`. Window samples are clipped at the image border
 * rather than zero padded, so a mask touching the edge stays opaque there instead of fading out.
 */
export function featherMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array<ArrayBuffer> {
  const total = width * height
  const out = new Uint8Array(Math.max(0, mask.length))
  if (mask.length !== total || total <= 0) return out
  const r = Math.max(0, Math.min(Math.floor(radius), Math.max(width, height)))
  if (r === 0) {
    out.set(mask)
    return out
  }
  const across = new Float32Array(total)
  const window = 2 * r + 1
  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    for (let x = 0; x < width; x++) sum += mask[row + Math.min(x, width - 1)]
    // Reseed the window sum for every row so the border clipping is exact.
    sum = 0
    for (let x = -r; x <= r; x++) sum += mask[row + Math.min(Math.max(x, 0), width - 1)]
    for (let x = 0; x < width; x++) {
      across[row + x] = sum / window
      const leaving = Math.min(Math.max(x - r, 0), width - 1)
      const entering = Math.min(Math.max(x + r + 1, 0), width - 1)
      sum += mask[row + entering] - mask[row + leaving]
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += across[Math.min(Math.max(y, 0), height - 1) * width + x]
    for (let y = 0; y < height; y++) {
      const value = sum / window
      out[y * width + x] = Math.max(0, Math.min(255, Math.round(value)))
      const leaving = Math.min(Math.max(y - r, 0), height - 1)
      const entering = Math.min(Math.max(y + r + 1, 0), height - 1)
      sum += across[entering * width + x] - across[leaving * width + x]
    }
  }
  return out
}

/** Smallest rectangle containing every non-zero pixel, or `null` for an empty mask. */
export function bboxOf(mask: Uint8Array, width: number, height: number): PixelRect | null {
  if (width <= 0 || height <= 0) return null
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  const scan = Math.min(mask.length, width * height)
  for (let i = 0; i < scan; i++) {
    if (mask[i] === 0) continue
    const x = i % width
    const y = (i - x) / width
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** Number of pixels with any coverage. */
export function maskArea(mask: Uint8Array): number {
  let count = 0
  for (let i = 0; i < mask.length; i++) if (mask[i] > 0) count++
  return count
}

function sameSize(a: Uint8Array, b: Uint8Array, operation: string): number {
  if (a.length !== b.length) {
    throw new RangeError(`${operation} needs two masks of the same length (${a.length} vs ${b.length}).`)
  }
  return a.length
}

/** Pixel-wise maximum. */
export function unionMask(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const length = sameSize(a, b, 'unionMask')
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = a[i] > b[i] ? a[i] : b[i]
  return out
}

/** Pixels of `a` that are not covered by `b`. */
export function subtractMask(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const length = sameSize(a, b, 'subtractMask')
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = b[i] > 0 ? 0 : a[i]
  return out
}

/** Pixel-wise minimum. */
export function intersectMask(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const length = sameSize(a, b, 'intersectMask')
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = a[i] < b[i] ? a[i] : b[i]
  return out
}

interface AxisTaps {
  start: Int32Array
  count: Int32Array
  offset: Int32Array
  weights: Float32Array
}

/**
 * Resampling taps of one axis. Downscaling averages exactly the source area each output pixel covers
 * (a fractional box filter, so area — and therefore mass — is preserved); upscaling interpolates
 * linearly between the two nearest pixel centres. Each axis picks its own rule, so a non uniform
 * resize stays area correct where it shrinks and smooth where it grows.
 */
function axisTaps(source: number, target: number): AxisTaps {
  const start = new Int32Array(target)
  const count = new Int32Array(target)
  const offset = new Int32Array(target)
  const weights: number[] = []
  const shrink = target < source
  const ratio = source / target
  for (let d = 0; d < target; d++) {
    offset[d] = weights.length
    if (shrink) {
      const low = d * ratio
      const high = Math.min(source, (d + 1) * ratio)
      const first = Math.floor(low)
      const last = Math.min(source - 1, Math.ceil(high) - 1)
      start[d] = first
      for (let i = first; i <= last; i++) weights.push((Math.min(i + 1, high) - Math.max(i, low)) / ratio)
      count[d] = last - first + 1
    } else {
      const centre = (d + 0.5) * ratio - 0.5
      const left = Math.floor(centre)
      const fraction = centre - left
      const a = Math.min(Math.max(left, 0), source - 1)
      const b = Math.min(Math.max(left + 1, 0), source - 1)
      start[d] = a
      if (a === b || fraction === 0) {
        count[d] = 1
        weights.push(1)
      } else {
        count[d] = 2
        weights.push(1 - fraction, fraction)
      }
    }
  }
  return { start, count, offset, weights: Float32Array.from(weights) }
}

/**
 * Resizes a coverage mask to `toWidth` x `toHeight`. Coverage values are interpolated and rounded back
 * to 0..255, so a soft (feathered) mask survives a resize as a soft mask. Dimensions are at least 1.
 */
export function resizeMask(
  mask: Uint8Array,
  width: number,
  height: number,
  toWidth: number,
  toHeight: number,
): Uint8Array<ArrayBuffer> {
  const tw = Math.max(1, Math.round(toWidth))
  const th = Math.max(1, Math.round(toHeight))
  if (width <= 0 || height <= 0 || mask.length !== width * height) return new Uint8Array(tw * th)
  if (tw === width && th === height) {
    const same = new Uint8Array(mask.length)
    same.set(mask)
    return same
  }
  const columns = axisTaps(width, tw)
  const rows = axisTaps(height, th)
  const across = new Float32Array(tw * height)
  for (let y = 0; y < height; y++) {
    const rowBase = y * width
    const outBase = y * tw
    for (let x = 0; x < tw; x++) {
      const first = columns.start[x]
      const taps = columns.count[x]
      const at = columns.offset[x]
      let sum = 0
      for (let t = 0; t < taps; t++) sum += columns.weights[at + t] * mask[rowBase + first + t]
      across[outBase + x] = sum
    }
  }
  const out = new Uint8Array(tw * th)
  for (let y = 0; y < th; y++) {
    const first = rows.start[y]
    const taps = rows.count[y]
    const at = rows.offset[y]
    const outBase = y * tw
    for (let x = 0; x < tw; x++) {
      let sum = 0
      for (let t = 0; t < taps; t++) sum += rows.weights[at + t] * across[(first + t) * tw + x]
      out[outBase + x] = Math.max(0, Math.min(255, Math.round(sum)))
    }
  }
  return out
}

/**
 * Per pixel luminance (`0.299 R + 0.587 G + 0.114 B`), one byte per pixel. Alpha is deliberately
 * ignored: coverage is expressed with `PixelMask`, and a transparent pixel's colour is unknown rather
 * than black.
 */
export function grayscale(raster: Raster): Uint8Array<ArrayBuffer> {
  const { width, height, data } = raster
  const total = Math.max(0, width * height)
  const out = new Uint8Array(total)
  const pixels = Math.min(total, Math.floor(data.length / 4))
  for (let i = 0; i < pixels; i++) {
    const at = i * 4
    out[i] = Math.round(0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2])
  }
  return out
}

/**
 * Crops `bounds` out of `raster`, keeping only the pixels where `mask > 0`: alpha is multiplied by
 * `mask / 255` (so a feathered mask yields a feathered edge) and RGB is zeroed outside the mask so no
 * hidden colour bleeds back in when the crop is resampled. The result is always at least 1 x 1.
 */
export function cutElement(raster: Raster, mask: PixelMask, bounds: PixelRect): Raster {
  const x0 = Math.max(0, Math.min(raster.width, Math.round(bounds.x)))
  const y0 = Math.max(0, Math.min(raster.height, Math.round(bounds.y)))
  const x1 = Math.max(x0, Math.min(raster.width, Math.round(bounds.x + bounds.width)))
  const y1 = Math.max(y0, Math.min(raster.height, Math.round(bounds.y + bounds.height)))
  const width = Math.max(1, x1 - x0)
  const height = Math.max(1, y1 - y0)
  const data = new Uint8ClampedArray(width * height * 4)
  const copyWidth = x1 - x0
  const copyHeight = y1 - y0
  for (let y = 0; y < copyHeight; y++) {
    const sourceRow = (y0 + y) * raster.width
    const targetRow = y * width * 4
    for (let x = 0; x < copyWidth; x++) {
      const sourceIndex = sourceRow + x0 + x
      const coverage = sourceIndex < mask.length ? mask[sourceIndex] : 0
      const target = targetRow + x * 4
      if (coverage === 0) continue
      const at = sourceIndex * 4
      data[target] = raster.data[at]
      data[target + 1] = raster.data[at + 1]
      data[target + 2] = raster.data[at + 2]
      data[target + 3] = Math.round((raster.data[at + 3] * coverage) / 255)
    }
  }
  return { width, height, data }
}
