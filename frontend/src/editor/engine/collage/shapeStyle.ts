/**
 * CSS clip of a slot's crop shape, for previews and thumbnails that are DOM, not canvas. The canvas
 * uses `buildSlotClip` (`objects/masks.ts`) with the same shapes stretched into the frame; here the
 * shape is expressed with `clip-path` / `border-radius` so a `<span>` can show it at any size.
 */
import type { MaskShape } from '@/types/document'
import { starPoints } from '../objects/shapeGeometry'

export interface SlotClipStyle {
  borderRadius?: string
  clipPath?: string
}

/** The shapes offered for one slot in the panel, in reading order (`null` is a plain rectangle). */
export const SLOT_SHAPES = [null, 'rounded', 'circle', 'arch', 'hexagon', 'diamond', 'star'] as const

export type SlotShapeChoice = (typeof SLOT_SHAPES)[number]

const pct = (n: number): string => `${Math.round(n * 100) / 100}%`

const polygon = (points: readonly { x: number; y: number }[]): string =>
  `polygon(${points.map((point) => `${pct(point.x)} ${pct(point.y)}`).join(', ')})`

/** The star is the same five-tip star the canvas mask uses (100 x 100 box, already normalised). */
const STAR_POINTS = starPoints(5, 0.45)

/**
 * The style that clips a DOM box of `width` x `height` to `shape`. A missing shape (or a custom path)
 * falls back to a soft rounded rectangle, which is what the canvas paints for those masks.
 */
export function slotClipStyle(shape: MaskShape | null | undefined, width: number, height: number, radius = 0.18): SlotClipStyle {
  const soft = `${Math.max(0, Math.min(1, radius)) * Math.max(0, Math.min(width, height))}px`
  if (!shape) return {}
  if (shape === 'rounded') return { borderRadius: soft }
  if (shape === 'circle') return { borderRadius: '50%' }
  if (shape === 'arch') return { borderRadius: '50% 50% 0 0 / 42% 42% 0 0' }
  if (shape === 'triangle') {
    return {
      clipPath: polygon([
        { x: 50, y: 4 },
        { x: 97, y: 94 },
        { x: 3, y: 94 },
      ]),
    }
  }
  if (shape === 'diamond') {
    return {
      clipPath: polygon([
        { x: 50, y: 2 },
        { x: 98, y: 50 },
        { x: 50, y: 98 },
        { x: 2, y: 50 },
      ]),
    }
  }
  if (shape === 'hexagon') {
    return {
      clipPath: polygon([
        { x: 26, y: 4 },
        { x: 74, y: 4 },
        { x: 98, y: 50 },
        { x: 74, y: 96 },
        { x: 26, y: 96 },
        { x: 2, y: 50 },
      ]),
    }
  }
  if (shape === 'star') return { clipPath: polygon(STAR_POINTS) }
  if (shape === 'cross') {
    return {
      clipPath: polygon([
        { x: 34, y: 2 },
        { x: 66, y: 2 },
        { x: 66, y: 34 },
        { x: 98, y: 34 },
        { x: 98, y: 66 },
        { x: 66, y: 66 },
        { x: 66, y: 98 },
        { x: 34, y: 98 },
        { x: 34, y: 66 },
        { x: 2, y: 66 },
        { x: 2, y: 34 },
        { x: 34, y: 34 },
      ]),
    }
  }
  return { borderRadius: soft }
}
