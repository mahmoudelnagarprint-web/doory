/**
 * Image expansion (outpainting alternatives) with correct coordinate mapping.
 *
 * Three honest modes, never labelled as AI:
 * - `mirror`: reflected content continuation (good for textured backgrounds)
 * - `replicate`: edge-pixel stretch (flat/diffuse backgrounds)
 * - generative: REQUIRES a backend diffusion service — not configured in this build, the UI
 *   shows the exact blocker instead of filling white pixels and claiming AI.
 *
 * All coordinate maths is in pure functions so it is unit-testable (directive Phase 10 §9-10).
 */

export type ExpandMode = 'mirror' | 'replicate' | 'generative'

/** Independent expansion per edge; in percent or pixels. */
export interface EdgeSpec {
  top: number
  right: number
  bottom: number
  left: number
  unit: 'percent' | 'pixels'
}

export interface ExpandRect {
  width: number
  height: number
  /** Where the original lands inside the expanded frame (integer pixels). */
  offsetX: number
  offsetY: number
  /** Per-edge pixel sizes actually applied (after rounding). */
  edges: { top: number; right: number; bottom: number; left: number }
}

const MIN_EXPANDED_DIM = 1

/** Minimum output width/height guard mirrors the editor's `MAX_DIMENSION` sanity levels. */
const MAX_OUTPUT_SIDE = 20_000

/**
 * Maps an expansion spec to concrete output geometry. Percentages are relative to the ORIGINAL
 * dimension per edge (left/right → width, top/bottom → height). Rounding is symmetric so the
 * original can land on integers without fractional offsets.
 */
export function computeExpandRect(srcWidth: number, srcHeight: number, spec: EdgeSpec): ExpandRect {
  const px = spec.unit === 'pixels'
  const top = Math.round(px ? spec.top : (spec.top / 100) * srcHeight)
  const bottom = Math.round(px ? spec.bottom : (spec.bottom / 100) * srcHeight)
  const left = Math.round(px ? spec.left : (spec.left / 100) * srcWidth)
  const right = Math.round(px ? spec.right : (spec.right / 100) * srcWidth)
  const width = Math.max(MIN_EXPANDED_DIM, Math.min(MAX_OUTPUT_SIDE, left + srcWidth + right))
  const height = Math.max(MIN_EXPANDED_DIM, Math.min(MAX_OUTPUT_SIDE, top + srcHeight + bottom))
  return {
    width,
    height,
    offsetX: left,
    offsetY: top,
    edges: { top, right, bottom, left },
  }
}

/**
 * Binary mask of everything that is NOT original content (alpha 255 there, 0 inside).
 * Pure, shape `[height][width]` flat array — masks feed any backend inpainting contract later.
 */
export function generateMask(rect: ExpandRect): Uint8Array {
  const { width, height, offsetX, offsetY } = rect
  if (rect.edges.top + rect.edges.bottom + rect.edges.left + rect.edges.right === 0) {
    return new Uint8Array(width * height)
  }
  const mask = new Uint8Array(width * height).fill(255)
  for (let y = offsetY; y < offsetY + height - rect.edges.top - rect.edges.bottom; y++) {
    if (y < 0 || y >= height) continue
    for (let x = offsetX; x < offsetX + width - rect.edges.left - rect.edges.right; x++) {
      if (x < 0 || x >= width) continue
      mask[y * width + x] = 0
    }
  }
  return mask
}

/**
 * Fast classical expansion on RGBA bytes. The original MUST stay byte-identical (directives:
 * alignment + no silent overwrite); only the new border zones are synthesised.
 */
export function expandClassical(
  source: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number },
  mode: Exclude<ExpandMode, 'generative'>,
  rect: ExpandRect,
): Uint8ClampedArray<ArrayBuffer> {
  const { width: sw, height: sh, data } = source
  const { width: dw, height: dh, offsetX, offsetY, edges } = rect
  const out = new Uint8ClampedArray(dw * dh * 4)

  // 1) Copy the original region byte-for-byte.
  for (let y = 0; y < sh; y++) {
    const dy = offsetY + y
    if (dy < 0 || dy >= dh) continue
    out.set(data.subarray(y * sw * 4, (y + 1) * sw * 4), (dy * dw + offsetX) * 4)
  }

  // Known-original flags for boundary sampling.
  const inside = (x: number, y: number): boolean =>
    x >= offsetX && x < offsetX + sw && y >= offsetY && y < offsetY + sh

  /** Pixel copy with mirror/replicate coordinate mapping across the original's bounds. */
  const sampleOriginal = (x: number, y: number, outIdx: number): void => {
    if (mode === 'replicate') {
      // Replicate clamps the OUT-OF-BOUNDS coordinate onto the original's edge — and the clamped
      // coordinate must be converted back to SOURCE-LOCAL space before indexing `data`.
      const lx = Math.min(sw - 1, Math.max(0, x - offsetX))
      const ly = Math.min(sh - 1, Math.max(0, y - offsetY))
      out.set(data.subarray((ly * sw + lx) * 4, (ly * sw + lx) * 4 + 4), outIdx)
      return
    }
    // Mirror: reflect around each edge, odd/even segments alternate (pong-pong reflection).
    let mx = x - offsetX
    if (mx < 0) mx = -mx - 1
    else if (mx >= sw) mx = 2 * sw - mx - 1
    let my = y - offsetY
    if (my < 0) my = -my - 1
    else if (my >= sh) my = 2 * sh - my - 1
    mx = Math.min(sw - 1, Math.max(0, mx))
    my = Math.min(sh - 1, Math.max(0, my))
    out.set(data.subarray((my * sw + mx) * 4, (my * sw + mx) * 4 + 4), outIdx)
  }

  // 2) Fill the four border bands. Top/bottom bands span the full new width (incl. corners),
  //    then left/right bands span only the original's vertical range (no double fill).
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      if (inside(x, y)) { x = offsetX + sw - 1; continue }
      if (y < offsetY || y >= offsetY + sh) {
        // top/bottom band rows — full width
        sampleOriginal(x, y, (y * dw + x) * 4)
      } else if (x < offsetX || x >= offsetX + sw) {
        // left/right band within the original's rows
        sampleOriginal(x, y, (y * dw + x) * 4)
      }
    }
  }
  void edges
  return out
}

/** Text for the UI explaining exactly why generative expand is unavailable. */
export const GENERATIVE_EXPAND_BLOCKED =
  'التوسيع التوليدي يتطلب خدمة استدلال خلفية (diffusion backend) غير مهيأة في هذه النسخة. ' +
  'الأنماط الفورية المتوفرة: التمديد المرآتي أو حسب الحواف — وقناع التوسيع جاهز لو أُضيفت خدمة التوليد لاحقًا.'
