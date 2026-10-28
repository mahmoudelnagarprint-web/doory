/**
 * Slot-to-slot swapping, pure geometry. When a frame is dragged in `edit-frame` mode and dropped
 * mostly over another slot, the two photos trade places (the frames never move). All maths here is
 * testable without a canvas.
 */
import type { SlotSpec } from '@/types/document'
import { slotCorners } from '../objects/slot'

export interface SlotBox {
  left: number
  top: number
  width: number
  height: number
}

export interface SlotCandidate {
  id: string
  slot: SlotSpec
}

/** The axis-aligned box around a (possibly tilted) slot frame. */
export function slotBox(slot: SlotSpec): SlotBox {
  const points = slotCorners(slot)
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

function intersection(a: SlotBox, b: SlotBox): number {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  return width > 0 && height > 0 ? width * height : 0
}

/** How much of `a`'s frame lies inside `b`'s (0..1); a frame with no area never overlaps. */
export function frameOverlap(a: SlotSpec, b: SlotSpec): number {
  const boxA = slotBox(a)
  const area = boxA.width * boxA.height
  if (area <= 0) return 0
  return Math.min(1, intersection(boxA, slotBox(b)) / area)
}

/**
 * The candidate the dragged slot should trade photos with: the one covering most of it, provided at
 * least `minRatio` of the dragged frame is on top of it. The source itself never matches.
 */
export function swapTarget<T extends SlotCandidate>(source: SlotCandidate, candidates: readonly T[], minRatio = 0.5): T | undefined {
  let best: { candidate: T; ratio: number } | null = null
  for (const candidate of candidates) {
    if (candidate.id === source.id) continue
    const ratio = frameOverlap(source.slot, candidate.slot)
    if (ratio < minRatio) continue
    if (!best || ratio > best.ratio) best = { candidate, ratio }
  }
  return best?.candidate
}
