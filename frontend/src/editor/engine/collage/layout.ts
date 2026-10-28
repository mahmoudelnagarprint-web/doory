/**
 * The pure layout solver of Smart Collage Studio.
 *
 * A template is only a way of dividing a rectangle into `count` slots. It knows nothing about Fabric,
 * the page or the photos already in the slots: those stay where they are and only their frames move.
 * That keeps changing a template cheap and, above all, non-destructive.
 */
import type { CollageBounds, CollageFrameSpec, CollageLayoutId, CollageMeta, CollageStyle, MaskShape } from '@/types/document'

/** The seven hand-written templates offered as thumbnails; `custom` is a set of explicit frames. */
export type BuiltinCollageLayoutId = Exclude<CollageLayoutId, 'custom'>

export const COLLAGE_LAYOUTS: readonly BuiltinCollageLayoutId[] = ['grid', 'hero', 'mosaic', 'strip', 'masonry', 'polaroid', 'arch']
export const ALL_COLLAGE_LAYOUTS: readonly CollageLayoutId[] = [...COLLAGE_LAYOUTS, 'custom']

export const COLLAGE_MIN_SLOTS = 1
export const COLLAGE_MAX_SLOTS = 16

/** Default collage frame (warm mat with gold rings), scaled to the page like the editor's other presets. */
export function defaultCollageStyle(page: { width: number; height: number }): CollageStyle {
  const k = Math.max(0.65, Math.min(page.width, page.height) / 559)
  return {
    matColor: '#f5efe2',
    matWidth: Math.max(3, Math.round(8 * k)),
    outerColor: '#d4af37',
    outerWidth: Math.max(1, Math.round(2 * k)),
    innerColor: '#d4af37',
    innerWidth: Math.max(1, Math.round(1.5 * k)),
    radius: Math.max(2, Math.round(8 * k)),
    shadow: { color: 'rgba(0,0,0,0.42)', blur: Math.max(8, Math.round(20 * k)), offsetX: 0, offsetY: Math.max(3, Math.round(8 * k)) },
  }
}

export function defaultCollageMargin(page: { width: number; height: number }): number {
  return Math.max(8, Math.round(Math.min(page.width, page.height) * 0.06))
}

export function defaultCollageGap(page: { width: number; height: number }): number {
  return Math.max(4, Math.round(Math.min(page.width, page.height) * 0.018))
}

export interface CollageFrame {
  cx: number
  cy: number
  width: number
  height: number
  angle: number
  /** Per-frame crop shape of an explicit layout; absent for the built-in templates. */
  mask?: MaskShape
  /** Corner radius of a `rounded` mask, as a fraction of the shorter side (0..0.5). */
  radius?: number
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

function safeBox(bounds: CollageBounds, margin: number): Box {
  const m = Math.max(0, margin)
  return {
    x: bounds.x + m,
    y: bounds.y + m,
    width: Math.max(1, bounds.width - m * 2),
    height: Math.max(1, bounds.height - m * 2),
  }
}

function gridColumns(count: number): number {
  if (count <= 3) return count
  if (count <= 6) return Math.ceil(count / 2)
  if (count <= 9) return 3
  return 4
}

/** Equal cells; a short last row is centred rather than stretched. */
function grid(box: Box, count: number, columns: number, gap: number): CollageFrame[] {
  const cols = clamp(Math.round(columns), 1, count)
  const rows = Math.ceil(count / cols)
  const cellW = Math.max(1, (box.width - gap * (cols - 1)) / cols)
  const cellH = Math.max(1, (box.height - gap * (rows - 1)) / rows)
  const out: CollageFrame[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    const inRow = Math.min(cols, count - row * cols)
    const rowW = inRow * cellW + gap * (inRow - 1)
    const x = box.x + (box.width - rowW) / 2 + col * (cellW + gap)
    const y = box.y + row * (cellH + gap)
    out.push({ cx: x + cellW / 2, cy: y + cellH / 2, width: cellW, height: cellH, angle: 0 })
  }
  return out
}

/** One large picture with the rest in a smaller column beside it. */
function hero(box: Box, count: number, gap: number): CollageFrame[] {
  if (count < 2) return grid(box, count, 1, gap)
  const bigW = box.width * 0.62
  const restW = box.width - bigW - gap
  const restCount = count - 1
  const restCols = restCount > 2 ? 2 : 1
  const restRows = Math.ceil(restCount / restCols)
  const restCellW = Math.max(1, (restW - gap * (restCols - 1)) / restCols)
  const restCellH = Math.max(1, (box.height - gap * (restRows - 1)) / restRows)
  const out: CollageFrame[] = [{ cx: box.x + bigW / 2, cy: box.y + box.height / 2, width: bigW, height: box.height, angle: 0 }]
  for (let i = 0; i < restCount; i++) {
    const row = Math.floor(i / restCols)
    const col = i % restCols
    const inRow = Math.min(restCols, restCount - row * restCols)
    const rowW = inRow * restCellW + gap * (inRow - 1)
    const x = box.x + bigW + gap + (restW - rowW) / 2 + col * (restCellW + gap)
    const y = box.y + row * (restCellH + gap)
    out.push({ cx: x + restCellW / 2, cy: y + restCellH / 2, width: restCellW, height: restCellH, angle: 0 })
  }
  return out
}

/** The four-picture magazine mosaic: one feature, one under it, two down the side. */
function mosaic(box: Box, count: number, gap: number): CollageFrame[] {
  if (count !== 4) return grid(box, count, gridColumns(count), gap)
  const leftW = box.width * 0.6
  const rightW = box.width - leftW - gap
  const topH = (box.height - gap) * 0.64
  const bottomH = box.height - topH - gap
  const rightH = (box.height - gap) / 2
  return [
    { cx: box.x + leftW / 2, cy: box.y + topH / 2, width: leftW, height: topH, angle: 0 },
    { cx: box.x + leftW / 2, cy: box.y + topH + gap + bottomH / 2, width: leftW, height: bottomH, angle: 0 },
    { cx: box.x + leftW + gap + rightW / 2, cy: box.y + rightH / 2, width: rightW, height: rightH, angle: 0 },
    { cx: box.x + leftW + gap + rightW / 2, cy: box.y + rightH + gap + rightH / 2, width: rightW, height: rightH, angle: 0 },
  ]
}

/** Two or three columns of unequal rows, like a pinned mood board. */
function masonry(box: Box, count: number, gap: number): CollageFrame[] {
  const columns = count === 1 ? 1 : count <= 4 ? 2 : 3
  const rows = Math.ceil(count / columns)
  const weights = Array.from({ length: rows }, (_, row) => (row % 2 === 0 ? 1.18 : 0.82))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  const usableH = box.height - gap * (rows - 1)
  const heights = weights.map((w) => (usableH * w) / totalWeight)
  const cellW = Math.max(1, (box.width - gap * (columns - 1)) / columns)
  const out: CollageFrame[] = []
  let y = box.y
  for (let row = 0; row < rows; row++) {
    const inRow = Math.min(columns, count - row * columns)
    const rowW = inRow * cellW + gap * (inRow - 1)
    const startX = box.x + (box.width - rowW) / 2
    for (let col = 0; col < inRow; col++) {
      out.push({ cx: startX + col * (cellW + gap) + cellW / 2, cy: y + heights[row] / 2, width: cellW, height: heights[row], angle: 0 })
    }
    y += heights[row] + gap
  }
  return out
}

function polaroid(box: Box, count: number, gap: number): CollageFrame[] {
  const frames = grid(box, count, count === 1 ? 1 : count <= 4 ? 2 : 3, gap * 1.7)
  return frames.map((frame, i) => ({
    ...frame,
    width: frame.width * 0.92,
    height: frame.height * 0.92,
    angle: i % 2 === 0 ? -1.6 : 1.6,
  }))
}

/** Mirrors the solved frames for a right-to-left reading order (index 0 on the right). */
function mirror(frames: CollageFrame[], box: Box): CollageFrame[] {
  return frames.map((frame) => ({
    ...frame,
    cx: box.x + box.width - (frame.cx - box.x),
    angle: -frame.angle || 0,
  }))
}

/**
 * Solves a template. The returned order is the reading order: slot 1 is the first item, and on an RTL
 * collage it sits on the right. All lengths are page px.
 */
export function resolveLayout(
  layout: CollageLayoutId,
  count: number,
  bounds: CollageBounds,
  gap: number,
  margin: number,
  rtl: boolean,
): CollageFrame[] {
  const n = clamp(Math.round(count), COLLAGE_MIN_SLOTS, COLLAGE_MAX_SLOTS)
  const box = safeBox(bounds, margin)
  const g = Math.max(0, Math.min(gap, Math.min(box.width, box.height) / 3))
  let frames: CollageFrame[]
  switch (layout) {
    case 'hero':
      frames = hero(box, n, g)
      break
    case 'mosaic':
      frames = mosaic(box, n, g)
      break
    case 'strip':
      frames = grid(box, n, Math.min(n, 4), g)
      break
    case 'masonry':
      frames = masonry(box, n, g)
      break
    case 'polaroid':
      frames = polaroid(box, n, g)
      break
    case 'arch':
      frames = grid(box, n, n <= 2 ? n : n <= 4 ? 2 : 3, g)
      break
    case 'custom':
    case 'grid':
    default:
      frames = grid(box, n, gridColumns(n), g)
      break
  }
  return rtl ? mirror(frames, box) : frames
}

/**
 * Resolves explicit, bounds-relative frames. The specs are already spaced, so `gap` is not used:
 * `margin` only insets the area they scale into, which keeps a curated or generated layout intact
 * when the page or its margin changes.
 */
export function resolveFrames(
  specs: readonly CollageFrameSpec[],
  bounds: CollageBounds,
  margin: number,
  rtl: boolean,
): CollageFrame[] {
  const box = safeBox(bounds, margin)
  return specs.slice(0, COLLAGE_MAX_SLOTS).map((spec) => {
    const x = rtl ? 1 - spec.x - spec.width : spec.x
    const width = Math.max(1, spec.width * box.width)
    const height = Math.max(1, spec.height * box.height)
    const angle = spec.angle ?? 0
    return {
      cx: box.x + x * box.width + width / 2,
      cy: box.y + spec.y * box.height + height / 2,
      width,
      height,
      angle: rtl ? -angle || 0 : angle,
      ...(spec.mask !== undefined ? { mask: spec.mask } : {}),
      ...(spec.radius !== undefined ? { radius: spec.radius } : {}),
    }
  })
}

/** The frames of a stored collage: its explicit layout when it has one, otherwise its template. */
export function framesFor(meta: Pick<CollageMeta, 'layout' | 'frames' | 'bounds' | 'gap' | 'margin' | 'rtl'>, count: number): CollageFrame[] {
  return meta.frames && meta.frames.length > 0
    ? resolveFrames(meta.frames, meta.bounds, meta.margin, meta.rtl)
    : resolveLayout(meta.layout, count, meta.bounds, meta.gap, meta.margin, meta.rtl)
}
