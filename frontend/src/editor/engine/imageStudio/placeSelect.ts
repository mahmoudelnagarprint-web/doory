/**
 * Camera Raw Studio — "classical select & place" core (pure, DOM-free, testable).
 *
 * Two selection behaviours the Select tab offers, both classical (never AI):
 *  - `selectByColor`: a whole-image colour key — every pixel whose max channel delta from a picked
 *    colour is within `tolerance` (0..255 per channel). Used for "pick a colour" mode.
 *  - `floodSelect` (in `./floodSelect.ts`): a contiguous region from a seed point. Used for
 *    "select a place" mode.
 *
 * Both produce a binary mask (`0`/`255`) at source resolution. `selectionBounds` recovers the
 * bounding box of the mask, and `compositePlacedImage` embeds a chosen image *inside* that mask:
 * the placed raster is cover-fit onto the bounding box (centre-anchored), and every masked pixel is
 * replaced by the placed pixel — only the selected shape is affected, the rest of the picture is
 * untouched. Pixels with partial alpha blend (feathered selections keep their soft edges).
 *
 * Everything here operates on raster/array objects so it runs identically in the browser and in
 * jsdom tests; canvas drawing / file decoding are left to the caller.
 */

export interface RasterSource {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

export interface PickedColor {
  r: number
  g: number
  b: number
}

/** Whole-image colour key: 255 where every channel is within `tolerance` of the picked colour. */
export function selectByColor(source: RasterSource, color: PickedColor, tolerance: number): Uint8ClampedArray<ArrayBuffer> {
  const { data, width, height } = source
  const mask = new Uint8ClampedArray(width * height)
  const tol = Math.max(0, Math.min(255, tolerance))
  for (let i = 0; i < width * height; i++) {
    const p = i * 4
    if (
      Math.abs(data[p] - color.r) <= tol &&
      Math.abs(data[p + 1] - color.g) <= tol &&
      Math.abs(data[p + 2] - color.b) <= tol
    ) {
      mask[i] = 255
    }
  }
  return mask
}

export interface Rect2D {
  x: number
  y: number
  width: number
  height: number
}

/** Bounding box of the selected pixels, or `null` when nothing is selected. */
export function selectionBounds(mask: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): Rect2D | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (mask[row + x] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Builds a *display-resolution* mask from a source-resolution mask (nearest-neighbour), so the
 * preview overlay can paint exactly what the full-res composite will affect.
 */
export function resizeMaskNearest(
  mask: Uint8ClampedArray<ArrayBuffer>,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(dstW * dstH)
  if (dstW === 0 || dstH === 0) return out
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH))
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW))
      out[y * dstW + x] = mask[sy * srcW + sx]
    }
  }
  return out
}

/**
 * Embeds `placed` inside the selection of `mask`:
 *  1. cover-fit `placed` onto the mask's bounding box (scale = max(boxW/srcW, boxH/srcH),
 *     centre-anchored so overflow crops symmetrically);
 *  2. every pixel where `mask > 0` takes the placed colour, weighted by the mask's own alpha
 *     (0 → keep base, 255 → fully replaced) and by the placed pixel's alpha;
 *  3. everything outside stays byte-identical to `base`.
 *
 * Returns a new `Uint8ClampedArray`; neither `base` nor `placed` is mutated.
 */
export function compositePlacedImage(base: RasterSource, mask: Uint8ClampedArray<ArrayBuffer>, placed: RasterSource): Uint8ClampedArray<ArrayBuffer> {
  const { width, height } = base
  const out = new Uint8ClampedArray(base.data)
  const box = selectionBounds(mask, width, height)
  if (!box) return out

  const scale = Math.max(box.width / placed.width, box.height / placed.height)
  // Centre-anchored cover: the placed image's centre sits on the box centre.
  const originX = box.x + (box.width - placed.width * scale) / 2
  const originY = box.y + (box.height - placed.height * scale) / 2

  const sampleBilinear = (fx: number, fy: number): [number, number, number, number] | null => {
    if (fx < -1 || fy < -1 || fx > placed.width || fy > placed.height) return null
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const at = (x: number, y: number): [number, number, number, number] => {
      const cx = Math.max(0, Math.min(placed.width - 1, x))
      const cy = Math.max(0, Math.min(placed.height - 1, y))
      const p = (cy * placed.width + cx) * 4
      return [placed.data[p], placed.data[p + 1], placed.data[p + 2], placed.data[p + 3]]
    }
    const a = at(x0, y0)
    const b = at(x0 + 1, y0)
    const c = at(x0, y0 + 1)
    const d = at(x0 + 1, y0 + 1)
    return [
      a[0] * (1 - tx) * (1 - ty) + b[0] * tx * (1 - ty) + c[0] * (1 - tx) * ty + d[0] * tx * ty,
      a[1] * (1 - tx) * (1 - ty) + b[1] * tx * (1 - ty) + c[1] * (1 - tx) * ty + d[1] * tx * ty,
      a[2] * (1 - tx) * (1 - ty) + b[2] * tx * (1 - ty) + c[2] * (1 - tx) * ty + d[2] * tx * ty,
      a[3] * (1 - tx) * (1 - ty) + b[3] * tx * (1 - ty) + c[3] * (1 - tx) * ty + d[3] * tx * ty,
    ]
  }

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const m = mask[row + x]
      if (m === 0) continue
      const fx = (x - originX) / scale
      const fy = (y - originY) / scale
      const sampled = sampleBilinear(fx, fy)
      if (!sampled) continue
      const [pr, pg, pb, pa] = sampled
      const i = (row + x) * 4
      // mask weight × placed alpha: a soft selection edge keeps its feather, transparent placed
      // pixels let the original show through instead of stamping black holes.
      const w = (m / 255) * (pa / 255)
      out[i] = base.data[i] * (1 - w) + pr * w
      out[i + 1] = base.data[i + 1] * (1 - w) + pg * w
      out[i + 2] = base.data[i + 2] * (1 - w) + pb * w
      out[i + 3] = Math.max(base.data[i + 3], w * 255)
    }
  }
  return out
}
