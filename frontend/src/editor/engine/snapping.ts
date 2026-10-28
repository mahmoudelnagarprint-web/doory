/**
 * Smart-guide snapping. Pure geometry: given the moving rectangle, the other rectangles on the page
 * and the page size, returns the snap translation and the guide lines to draw.
 *
 * Candidates are edges and centres of the page and of every other object. Equal-spacing hints are
 * detected between the moving rect and its nearest neighbours on each axis.
 */
import { type Rect, rectBottom, rectCenterX, rectCenterY, rectRight } from './geometry'

export const SNAP_THRESHOLD_PX = 5

export interface SnapGuide {
  axis: 'x' | 'y'
  /** Coordinate of the guide line along its axis (page px). */
  pos: number
  /** Extent of the guide along the other axis (page px). */
  from: number
  to: number
  kind: 'edge' | 'center' | 'page'
}

export interface SpacingHint {
  axis: 'x' | 'y'
  /** Gap length in page px. */
  gap: number
  /** Segments drawn between the objects, as [from, to] along `axis`, at coordinate `at` on the other axis. */
  segments: { from: number; to: number; at: number }[]
}

export interface SnapResult {
  dx: number
  dy: number
  guides: SnapGuide[]
  spacing: SpacingHint[]
}

interface Stop {
  pos: number
  kind: SnapGuide['kind']
  /** Extent of the source rect on the other axis (so the guide spans both rects). */
  from: number
  to: number
}

function axisStops(others: readonly Rect[], page: Rect, axis: 'x' | 'y'): Stop[] {
  const stops: Stop[] = []
  const pageFrom = axis === 'x' ? page.top : page.left
  const pageTo = axis === 'x' ? rectBottom(page) : rectRight(page)
  if (axis === 'x') {
    stops.push({ pos: page.left, kind: 'page', from: pageFrom, to: pageTo })
    stops.push({ pos: rectCenterX(page), kind: 'page', from: pageFrom, to: pageTo })
    stops.push({ pos: rectRight(page), kind: 'page', from: pageFrom, to: pageTo })
  } else {
    stops.push({ pos: page.top, kind: 'page', from: pageFrom, to: pageTo })
    stops.push({ pos: rectCenterY(page), kind: 'page', from: pageFrom, to: pageTo })
    stops.push({ pos: rectBottom(page), kind: 'page', from: pageFrom, to: pageTo })
  }
  for (const r of others) {
    const from = axis === 'x' ? r.top : r.left
    const to = axis === 'x' ? rectBottom(r) : rectRight(r)
    if (axis === 'x') {
      stops.push({ pos: r.left, kind: 'edge', from, to })
      stops.push({ pos: rectCenterX(r), kind: 'center', from, to })
      stops.push({ pos: rectRight(r), kind: 'edge', from, to })
    } else {
      stops.push({ pos: r.top, kind: 'edge', from, to })
      stops.push({ pos: rectCenterY(r), kind: 'center', from, to })
      stops.push({ pos: rectBottom(r), kind: 'edge', from, to })
    }
  }
  return stops
}

interface AxisSnap {
  delta: number
  matches: Stop[]
}

function snapAxis(moving: Rect, stops: readonly Stop[], axis: 'x' | 'y', threshold: number): AxisSnap | null {
  const movers =
    axis === 'x'
      ? [moving.left, rectCenterX(moving), rectRight(moving)]
      : [moving.top, rectCenterY(moving), rectBottom(moving)]
  let best: { delta: number; mover: number } | null = null
  for (const mover of movers) {
    for (const stop of stops) {
      const delta = stop.pos - mover
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta) - 1e-9)) {
        best = { delta, mover }
      }
    }
  }
  if (!best) return null
  // Every stop that lines up after applying the snap is shown (several edges may align at once).
  const snapped = best.delta
  const matches: Stop[] = []
  for (const mover of movers) {
    for (const stop of stops) {
      if (Math.abs(stop.pos - (mover + snapped)) < 0.01) matches.push(stop)
    }
  }
  return { delta: snapped, matches }
}

function guidesFor(snap: AxisSnap, moving: Rect, axis: 'x' | 'y'): SnapGuide[] {
  const movFrom = axis === 'x' ? moving.top : moving.left
  const movTo = axis === 'x' ? rectBottom(moving) : rectRight(moving)
  const seen = new Set<string>()
  const out: SnapGuide[] = []
  for (const m of snap.matches) {
    const key = `${m.pos.toFixed(2)}:${m.kind}:${m.from}:${m.to}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      axis,
      pos: m.pos,
      from: Math.min(m.from, movFrom),
      to: Math.max(m.to, movTo),
      kind: m.kind,
    })
  }
  return out
}

function overlapsOnAxis(a: Rect, b: Rect, axis: 'x' | 'y'): boolean {
  // Two rects are "in line" along x if their vertical extents overlap (so a horizontal gap is meaningful).
  return axis === 'x' ? a.top < rectBottom(b) && rectBottom(a) > b.top : a.left < rectRight(b) && rectRight(a) > b.left
}

/**
 * Finds a position of `moving` that makes the gap to its left/right (or top/bottom) neighbours equal
 * to a gap that already exists between two other objects, or equal on both sides.
 */
function snapSpacing(moving: Rect, others: readonly Rect[], axis: 'x' | 'y', threshold: number): { delta: number; hints: SpacingHint[] } | null {
  const horizontal = axis === 'x'
  const start = (r: Rect): number => (horizontal ? r.left : r.top)
  const end = (r: Rect): number => (horizontal ? rectRight(r) : rectBottom(r))
  const lineAt = (r: Rect): number => (horizontal ? rectCenterY(r) : rectCenterX(r))
  const inLine = others.filter((o) => overlapsOnAxis(moving, o, axis))
  if (inLine.length === 0) return null
  const before = inLine.filter((o) => end(o) <= start(moving) + 0.01).sort((a, b) => end(b) - end(a))
  const after = inLine.filter((o) => start(o) >= end(moving) - 0.01).sort((a, b) => start(a) - start(b))
  const left = before[0]
  const right = after[0]
  let best: { delta: number; gap: number; neighbours: Rect[] } | null = null

  // Equal gap on both sides.
  if (left && right) {
    const total = start(right) - end(left) - (end(moving) - start(moving))
    const gap = total / 2
    const desiredStart = end(left) + gap
    const delta = desiredStart - start(moving)
    if (gap >= 0 && Math.abs(delta) <= threshold) best = { delta, gap, neighbours: [left, right] }
  }

  // Match an existing gap between two other objects (anywhere in line).
  const sortedAll = [...inLine].sort((a, b) => start(a) - start(b))
  const existing: number[] = []
  for (let i = 0; i < sortedAll.length - 1; i++) {
    const g = start(sortedAll[i + 1]) - end(sortedAll[i])
    if (g > 0.5) existing.push(g)
  }
  for (const g of existing) {
    if (left) {
      const delta = end(left) + g - start(moving)
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, gap: g, neighbours: [left] }
      }
    }
    if (right) {
      const delta = start(right) - g - end(moving) // moving's end should sit g before right's start
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, gap: g, neighbours: [right] }
      }
    }
  }
  if (!best) return null
  const shifted: Rect = horizontal ? { ...moving, left: moving.left + best.delta } : { ...moving, top: moving.top + best.delta }
  const hints: SpacingHint[] = []
  const segments: SpacingHint['segments'] = []
  for (const n of best.neighbours) {
    if (end(n) <= start(shifted) + 0.01) segments.push({ from: end(n), to: start(shifted), at: (lineAt(n) + lineAt(shifted)) / 2 })
    else segments.push({ from: end(shifted), to: start(n), at: (lineAt(n) + lineAt(shifted)) / 2 })
  }
  hints.push({ axis, gap: Math.round(best.gap * 100) / 100, segments })
  return { delta: best.delta, hints }
}

export interface SnapOptions {
  threshold?: number
  /** When false the result never moves anything (Alt/Cmd held, or snapping disabled). */
  enabled?: boolean
  spacing?: boolean
  /** Snap edges and centres to this step (page px) when no page/object stop is in range. */
  grid?: number
}

/** The nearest multiple of `grid` to `value` within `threshold`, or null. */
export function gridSnap(value: number, grid: number, threshold: number): number | null {
  if (!(grid > 0)) return null
  const target = Math.round(value / grid) * grid
  return Math.abs(target - value) <= threshold ? target : null
}

/** The smallest grid-alignment delta of a rectangle's edges and centre, or null when none is in range. */
function snapAxisToGrid(movers: readonly number[], grid: number, threshold: number): number | null {
  let best: number | null = null
  for (const mover of movers) {
    const target = gridSnap(mover, grid, threshold)
    if (target === null) continue
    const delta = target - mover
    if (best === null || Math.abs(delta) < Math.abs(best)) best = delta
  }
  return best
}

export function computeSnap(moving: Rect, others: readonly Rect[], page: Rect, options: SnapOptions = {}): SnapResult {
  const threshold = options.threshold ?? SNAP_THRESHOLD_PX
  if (options.enabled === false) return { dx: 0, dy: 0, guides: [], spacing: [] }
  const xSnap = snapAxis(moving, axisStops(others, page, 'x'), 'x', threshold)
  const ySnap = snapAxis(moving, axisStops(others, page, 'y'), 'y', threshold)
  const grid = options.grid && options.grid > 0 ? options.grid : 0
  // The grid is drawn behind the objects, so a grid snap needs no guide line of its own.
  const xGrid = !xSnap && grid > 0 ? snapAxisToGrid([moving.left, rectCenterX(moving), rectRight(moving)], grid, threshold) : null
  const yGrid = !ySnap && grid > 0 ? snapAxisToGrid([moving.top, rectCenterY(moving), rectBottom(moving)], grid, threshold) : null
  let dx = xSnap?.delta ?? xGrid ?? 0
  let dy = ySnap?.delta ?? yGrid ?? 0
  const guides: SnapGuide[] = []
  if (xSnap) guides.push(...guidesFor(xSnap, { ...moving, left: moving.left + dx }, 'x'))
  if (ySnap) guides.push(...guidesFor(ySnap, { ...moving, top: moving.top + dy }, 'y'))
  const spacing: SpacingHint[] = []
  if (options.spacing !== false) {
    if (!xSnap && xGrid === null) {
      const s = snapSpacing(moving, others, 'x', threshold)
      if (s) {
        dx = s.delta
        spacing.push(...s.hints)
      }
    }
    if (!ySnap && yGrid === null) {
      const s = snapSpacing({ ...moving, left: moving.left + dx }, others, 'y', threshold)
      if (s) {
        dy = s.delta
        spacing.push(...s.hints)
      }
    }
  }
  return { dx, dy, guides, spacing }
}

export interface ResizeDrag {
  /** The vertical edge being dragged (`left` or `right`), if any. */
  x?: 'left' | 'right'
  /** The horizontal edge being dragged (`top` or `bottom`), if any. */
  y?: 'top' | 'bottom'
}

export interface ResizeSnap {
  /** Amount to add to the dragged vertical edge (0 when it does not snap). */
  dx: number
  dy: number
  guides: SnapGuide[]
}

/**
 * Snapping while resizing: only the edge that is being dragged sticks to the edges and centres of the page and of
 * the other objects, the opposite edge stays where it is.
 */
export function computeResizeSnap(moving: Rect, others: readonly Rect[], page: Rect, drag: ResizeDrag, threshold = SNAP_THRESHOLD_PX, grid = 0): ResizeSnap {
  const out: ResizeSnap = { dx: 0, dy: 0, guides: [] }
  const nearest = (stops: readonly Stop[], pos: number): Stop | null => {
    let best: Stop | null = null
    for (const stop of stops) {
      const d = stop.pos - pos
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.pos - pos) - 1e-9)) best = stop
    }
    return best
  }
  if (drag.x) {
    const pos = drag.x === 'left' ? moving.left : rectRight(moving)
    const hit = nearest(axisStops(others, page, 'x'), pos)
    if (hit) {
      out.dx = hit.pos - pos
      const edited = { ...moving, left: drag.x === 'left' ? moving.left + out.dx : moving.left, width: moving.width + (drag.x === 'left' ? -out.dx : out.dx) }
      out.guides.push({ axis: 'x', pos: hit.pos, from: Math.min(hit.from, edited.top), to: Math.max(hit.to, rectBottom(edited)), kind: hit.kind })
    } else if (grid > 0) {
      const target = gridSnap(pos, grid, threshold)
      if (target !== null) out.dx = target - pos
    }
  }
  if (drag.y) {
    const pos = drag.y === 'top' ? moving.top : rectBottom(moving)
    const hit = nearest(axisStops(others, page, 'y'), pos)
    if (hit) {
      out.dy = hit.pos - pos
      const edited = { ...moving, top: drag.y === 'top' ? moving.top + out.dy : moving.top, height: moving.height + (drag.y === 'top' ? -out.dy : out.dy) }
      out.guides.push({ axis: 'y', pos: hit.pos, from: Math.min(hit.from, edited.left), to: Math.max(hit.to, rectRight(edited)), kind: hit.kind })
    } else if (grid > 0) {
      const target = gridSnap(pos, grid, threshold)
      if (target !== null) out.dy = target - pos
    }
  }
  return out
}
