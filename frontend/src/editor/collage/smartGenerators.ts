/**
 * Zero-key layout ideas for Smart Collage Studio.
 *
 * There is no server and no paid API here: every preset is a set of bounds-relative frames built
 * from a handful of deterministic recipes (grids, magazine splits, BSP/Mondrian cuts, a golden-ratio
 * spiral and the Flickr justified-row algorithm). A seed always produces the same layout, so
 * "shuffle" is cheap and a shared design reopens exactly as it was saved.
 *
 * This module is lazy-loaded by the panel; nothing here belongs in the editor's initial bundle.
 */
import type { CollageFrameSpec, MaskShape } from '@/types/document'

export type CollageCategoryId =
  | 'grids'
  | 'editorial'
  | 'luxury'
  | 'polaroid'
  | 'diagonal'
  | 'honeycomb'
  | 'filmstrip'
  | 'procedural'

export interface CollageCategory {
  id: CollageCategoryId
  label: string
  hint: string
}

export const COLLAGE_CATEGORIES: readonly CollageCategory[] = [
  { id: 'grids', label: 'Classic grids', hint: 'Calm, even rows that suit any set of photos.' },
  { id: 'editorial', label: 'Editorial', hint: 'A feature picture with supporting frames, like a magazine spread.' },
  { id: 'luxury', label: 'Arches & shapes', hint: 'Arched, round and faceted frames with generous breathing room.' },
  { id: 'polaroid', label: 'Polaroid', hint: 'Slightly tilted prints, ready for a thick paper mat.' },
  { id: 'diagonal', label: 'Diagonal', hint: 'Slanted bands and overlapping rhythm for a livelier wall.' },
  { id: 'honeycomb', label: 'Honeycomb', hint: 'Hexagons, circles and prisms in an offset mosaic.' },
  { id: 'filmstrip', label: 'Film strip', hint: 'Wide frames in a reel, contact sheet or timeline.' },
  { id: 'procedural', label: 'Procedural', hint: 'Never-repeating BSP, Mondrian and golden-spiral compositions.' },
]

export interface CollagePreset {
  id: string
  name: string
  category: CollageCategoryId
  count: number
  frames: CollageFrameSpec[]
}

export const COLLAGE_MIN_COUNT = 1
export const COLLAGE_MAX_COUNT = 16

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))
const round = (n: number): number => Math.round(n * 10000) / 10000

interface Cell {
  x: number
  y: number
  width: number
  height: number
}

/* ---------------------------------------------------------------------------------------------- seeds */

/** Mulberry32: tiny, fast and stable across engines. The same seed always gives the same layout. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

let seedClock = 0

/** A fresh seed for "generate another idea"; still deterministic once handed to a generator. */
export function nextLayoutSeed(): number {
  seedClock = (seedClock + 1) % 100000
  return (Date.now() + seedClock * 7919) >>> 0
}

/* ----------------------------------------------------------------------------------------------- cells */

function fullCell(): Cell {
  return { x: 0, y: 0, width: 1, height: 1 }
}

function inset(cell: Cell, amount: number): Cell {
  const a = clamp(amount, 0, 0.45)
  return {
    x: cell.x + a,
    y: cell.y + a,
    width: Math.max(0.001, cell.width - a * 2),
    height: Math.max(0.001, cell.height - a * 2),
  }
}

/** Equal cells inside a rectangle. A short last row is centred rather than stretched. */
function cellsIn(rect: Cell, count: number, columns: number, gap: number): Cell[] {
  const n = Math.max(1, Math.round(count))
  const cols = clamp(Math.round(columns), 1, n)
  const rows = Math.ceil(n / cols)
  const g = Math.max(0, gap)
  const width = Math.max(0.001, (rect.width - g * (cols - 1)) / cols)
  const height = Math.max(0.001, (rect.height - g * (rows - 1)) / rows)
  const out: Cell[] = []
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    const inRow = Math.min(cols, n - row * cols)
    const rowWidth = inRow * width + g * (inRow - 1)
    out.push({
      x: rect.x + (rect.width - rowWidth) / 2 + col * (width + g),
      y: rect.y + row * (height + g),
      width,
      height,
    })
  }
  return out
}

function toSpec(cell: Cell, extra: Partial<CollageFrameSpec> = {}): CollageFrameSpec {
  const width = clamp(cell.width, 0.001, 1)
  const height = clamp(cell.height, 0.001, 1)
  return {
    x: round(clamp(cell.x, 0, Math.max(0, 1 - width))),
    y: round(clamp(cell.y, 0, Math.max(0, 1 - height))),
    width: round(width),
    height: round(height),
    ...extra,
  }
}

function columnsFor(count: number): number {
  if (count <= 3) return count
  if (count <= 6) return Math.ceil(count / 2)
  if (count <= 9) return 3
  return 4
}

/* -------------------------------------------------------------------------------------- BSP / Mondrian */

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const splitRatio = (rand: () => number, mondrian: boolean): number => {
  if (!mondrian) return rand() < 0.28 ? 0.5 : clamp(0.618 + (rand() - 0.5) * 0.16, 0.5, 0.74)
  const ratios = [0.28, 0.38, 0.5, 0.62, 0.72]
  return ratios[Math.floor(rand() * ratios.length) % ratios.length]
}

/**
 * Binary space partition: repeatedly split the largest remaining rectangle in two. `mondrian`
 * prefers long, unequal slices and occasionally splits a smaller rectangle, which gives the
 * familiar De Stijl rhythm instead of a balanced treemap.
 */
export function bspFrames(count: number, seed: number, gutter = 0.014, mondrian = false): CollageFrameSpec[] {
  const n = clamp(Math.round(count), 1, COLLAGE_MAX_COUNT)
  if (n === 1) {
    return [{ ...toSpec(fullCell()), ...(mondrian ? { mask: 'rounded' as const, radius: 0.02 } : {}) }]
  }
  const rand = seededRandom(seed)
  let rects: Rect[] = [fullCell()]
  let guard = 0
  while (rects.length < n && guard++ < n * 8) {
    const order = [...rects].sort((a, b) => b.width * b.height - a.width * a.height)
    const pick = mondrian && rand() < 0.3 ? Math.min(order.length - 1, Math.floor(rand() * Math.min(3, order.length))) : 0
    const target = order[pick]
    const index = rects.indexOf(target)
    if (!target || index < 0) break
    const vertical = target.width >= target.height
    const ratio = splitRatio(rand, mondrian)
    const first = vertical ? target.width * ratio : target.height * ratio
    const second = (vertical ? target.width : target.height) - first - gutter
    // Too fine to split: stop and let the even-grid fallback below fill in the remaining slots.
    if (Math.min(first, second) < 0.045) break
    if (!vertical) {
      rects.splice(
        index,
        1,
        { x: target.x, y: target.y, width: target.width, height: first },
        { x: target.x, y: target.y + first + gutter, width: target.width, height: second },
      )
    } else {
      rects.splice(
        index,
        1,
        { x: target.x, y: target.y, width: first, height: target.height },
        { x: target.x + first + gutter, y: target.y, width: second, height: target.height },
      )
    }
  }
  if (rects.length !== n) {
    // Degenerate splits (very high counts on a small canvas) fall back to an even grid.
    rects = cellsIn(fullCell(), n, columnsFor(n), gutter)
  }
  const mask: MaskShape | undefined = mondrian ? 'rounded' : undefined
  return rects.map((cell) => toSpec(cell, mask ? { mask, radius: 0.02 } : {}))
}

/* -------------------------------------------------------------------------------------- golden spiral */

/** Largest golden rectangle (w / h = phi) that fits inside `rect`, centred. */
function goldenRect(rect: Cell): Cell {
  const phi = 1.6180339887
  const width = Math.min(rect.width, rect.height * phi)
  const height = width / phi
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  }
}

/**
 * A golden-ratio spiral: cut the largest square off the current golden rectangle, turn, repeat.
 * The remainder is the innermost frame. The square is shrunk by the gutter so the ring reads as a
 * frame rather than a shared edge.
 */
function spiralWithin(rect: Cell, count: number, gutter: number): Cell[] {
  const n = Math.max(1, count)
  if (n === 1) return [inset(rect, gutter / 2)]
  const out: Cell[] = []
  let box = goldenRect(rect)
  let turn = 0
  let remaining = n
  while (remaining > 1) {
    const side = Math.min(box.width, box.height)
    if (side < 0.035) break
    let cell: Cell
    if (turn % 4 === 0) {
      cell = { x: box.x, y: box.y, width: side, height: box.height }
      box = { x: box.x + side, y: box.y, width: box.width - side, height: box.height }
    } else if (turn % 4 === 1) {
      cell = { x: box.x, y: box.y + box.height - side, width: box.width, height: side }
      box = { x: box.x, y: box.y, width: box.width, height: box.height - side }
    } else if (turn % 4 === 2) {
      cell = { x: box.x + box.width - side, y: box.y, width: side, height: box.height }
      box = { x: box.x, y: box.y, width: box.width - side, height: box.height }
    } else {
      cell = { x: box.x, y: box.y, width: box.width, height: side }
      box = { x: box.x, y: box.y + side, width: box.width, height: box.height - side }
    }
    out.push(inset(cell, gutter / 2))
    turn++
    remaining--
  }
  if (box.width > 0.01 && box.height > 0.01) {
    if (remaining === 1) out.push(inset(box, gutter / 2))
    else out.push(...cellsIn(box, remaining, columnsFor(remaining), gutter).map((cell) => inset(cell, gutter / 2)))
  } else {
    out.push(...cellsIn(rect, remaining, columnsFor(remaining), gutter).map((cell) => inset(cell, gutter / 2)))
  }
  return out
}

/** Several small spirals side by side, so high photo counts keep usable frame sizes. */
export function goldenSpiralFrames(count: number, _seed = 0, gutter = 0.014): CollageFrameSpec[] {
  const n = clamp(Math.round(count), 1, COLLAGE_MAX_COUNT)
  if (n === 1) return [toSpec(inset(fullCell(), gutter / 2), { mask: 'rounded', radius: 0.03 })]
  const blocks = Math.ceil(n / 4)
  if (blocks === 1) {
    return spiralWithin(fullCell(), n, gutter).map((cell) => toSpec(cell, { mask: 'rounded', radius: 0.03 }))
  }
  const cols = Math.ceil(Math.sqrt(blocks))
  const blockRects = cellsIn(fullCell(), blocks, cols, gutter * 1.4)
  const out: CollageFrameSpec[] = []
  let left = n
  blockRects.forEach((rect, index) => {
    const slots = Math.max(1, Math.ceil(left / Math.max(1, blockRects.length - index)))
    const cells = spiralWithin(rect, Math.min(slots, left), gutter)
    left -= cells.length
    out.push(...cells.map((cell) => toSpec(cell, { mask: 'rounded', radius: 0.03 })))
  })
  while (out.length < n) out.push(toSpec(inset(fullCell(), 0.45)))
  return out.slice(0, n)
}

/* ------------------------------------------------------------------------------- justified rows (Flickr) */

/**
 * The Flickr justified-row algorithm: photos are packed into a row until the row's natural width
 * reaches the container, then the row height is solved from the sum of the aspect ratios, so every
 * row is flush left and right and the pictures keep their proportions.
 */
export function justifiedFrames(aspects: readonly number[], containerAspect = 1.4, gutter = 0.012): CollageFrameSpec[] {
  const ratios = aspects.map((aspect) => (Number.isFinite(aspect) && aspect > 0.1 ? clamp(aspect, 0.2, 6) : 1.4))
  const n = ratios.length
  if (n === 0) return []
  // The container is one unit wide; `height` is its height in those same units.
  const height = clamp(containerAspect, 0.2, 6)
  const gap = clamp(gutter, 0, 0.04)

  const pack = (targetHeight: number): number[][] => {
    const rows: number[][] = []
    let row: number[] = []
    let sum = 0
    for (const aspect of ratios) {
      row.push(aspect)
      sum += aspect
      const natural = sum * targetHeight + gap * (row.length - 1)
      if (natural >= 1 && row.length > 1) {
        rows.push(row)
        row = []
        sum = 0
      }
    }
    if (row.length > 0) rows.push(row)
    return rows
  }

  // Each row is solved to full width, so its height follows from the aspect ratios. The packing
  // target that brings the sum of those heights closest to (but not past) the container height wins;
  // a few dozen samples are enough for 16 photos and keep the result deterministic.
  const heightOf = (rows: readonly number[][]): number =>
    rows.reduce((sum, row) => sum + (1 - gap * (row.length - 1)) / row.reduce((a, b) => a + b, 0), 0)
    + gap * (rows.length - 1)
  let best: { rows: number[][]; total: number } | null = null
  let smallest: { rows: number[][]; total: number } | null = null
  for (let sample = 0; sample <= 72; sample++) {
    const target = 0.03 * Math.pow(6 / 0.03, sample / 72)
    const rows = pack(target)
    const total = heightOf(rows)
    if (total <= height && (!best || total > best.total)) best = { rows, total }
    if (!smallest || total < smallest.total) smallest = { rows, total }
  }
  // Very wide photos can still overflow: scale the whole solved layout down uniformly, which keeps
  // every photo's proportions, and centre it.
  const chosen = best ?? smallest ?? { rows: [ratios], total: heightOf([ratios]) }
  const fit = chosen.total > height ? height / Math.max(0.001, chosen.total) : 1
  const offsetX = (1 - fit) / 2
  const offsetY = chosen.total < height ? (height - chosen.total) / 2 : 0

  const frames: CollageFrameSpec[] = []
  let y = 0
  for (const row of chosen.rows) {
    const sum = row.reduce((a, b) => a + b, 0)
    const rowHeight = (1 - gap * (row.length - 1)) / sum
    let x = 0
    for (const aspect of row) {
      const width = aspect * rowHeight
      frames.push(toSpec({
        x: offsetX + x * fit,
        y: (offsetY + y * fit) / height,
        width: width * fit,
        height: (rowHeight * fit) / height,
      }))
      x += width + gap
    }
    y += rowHeight + gap
  }
  return frames
}

/* -------------------------------------------------------------------------------------------- recipes */

export const PROCEDURAL_RECIPES = ['auto', 'bsp', 'mondrian', 'spiral'] as const
export type ProceduralRecipe = (typeof PROCEDURAL_RECIPES)[number]

/** Deterministic procedural layout. `auto` picks BSP, Mondrian or the spiral from the seed. */
export function generateProcedural(
  seed: number,
  count: number,
  recipe: ProceduralRecipe = 'auto',
  gutter = 0.014,
): CollageFrameSpec[] {
  const n = clamp(Math.round(count), 1, COLLAGE_MAX_COUNT)
  const chosen = recipe === 'auto' ? (['bsp', 'mondrian', 'spiral'] as const)[Math.abs(Math.round(seed)) % 3] : recipe
  if (chosen === 'mondrian') return bspFrames(n, seed | 1, gutter, true)
  if (chosen === 'spiral') return goldenSpiralFrames(n, seed, gutter)
  return bspFrames(n, seed | 1, gutter, false)
}

/** A justified idea for the actual photo shapes in the collage. */
export function generateJustified(aspects: readonly number[], containerAspect = 1.4, gutter = 0.012): CollageFrameSpec[] {
  return justifiedFrames(aspects, containerAspect, gutter)
}

/* ------------------------------------------------------------------------------------------- categories */

const VARIANT_NAMES: Record<CollageCategoryId, readonly string[]> = {
  grids: ['Quiet', 'Dense', 'Columns', 'Contact', 'Offset'],
  editorial: ['Feature', 'Headline', 'Cut', 'Spread', 'De Stijl'],
  luxury: ['Arches', 'Circles', 'Diamonds', 'Soft', 'Gallery'],
  polaroid: ['Classic', 'Stagger', 'Dense', 'Scatter', 'Column'],
  diagonal: ['Slash', 'Bands', 'Tilt', 'Rhythm', 'Zigzag'],
  honeycomb: ['Hex', 'Drift', 'Prism', 'Hive', 'Gems'],
  filmstrip: ['Reel', 'Duo', 'Timeline', 'Vertical', 'Contact'],
  procedural: ['BSP', 'Mondrian', 'Spiral', 'Surprise', 'Split'],
}

function gridFrames(count: number, variant: number, gap = 0.014): CollageFrameSpec[] {
  const full = fullCell()
  if (count === 1) return [toSpec(full)]
  if (variant === 2) return cellsIn(full, count, count, gap).map((cell) => toSpec(cell))
  if (variant === 4) {
    // Offset rows: a deliberately informal grid, still inside the page.
    const cols = columnsFor(count)
    const rows = Math.ceil(count / cols)
    const cellWidth = Math.max(0.001, (1 - gap * (cols - 1)) / (cols + 0.35))
    const cellHeight = Math.max(0.001, (1 - gap * (rows - 1)) / rows)
    const out: CollageFrameSpec[] = []
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols)
      const col = i % cols
      const shift = row % 2 === 0 ? 0 : cellWidth * 0.32
      out.push(toSpec({
        x: Math.min(1 - cellWidth, shift + col * (cellWidth + gap)),
        y: row * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight,
      }))
    }
    return out
  }
  const columns = variant === 1 ? Math.min(count, Math.ceil(count / 2)) : variant === 3 ? Math.min(count, 4) : columnsFor(count)
  return cellsIn(full, count, columns, gap).map((cell) => toSpec(cell))
}

function featureLeft(count: number, gap: number): CollageFrameSpec[] {
  if (count === 1) return [toSpec(fullCell())]
  const featureWidth = count <= 3 ? 0.58 : 0.62
  const rest = count - 1
  const frames: CollageFrameSpec[] = [toSpec({ x: 0, y: 0, width: featureWidth - gap / 2, height: 1 })]
  frames.push(...cellsIn({ x: featureWidth + gap / 2, y: 0, width: 1 - featureWidth - gap / 2, height: 1 }, rest, rest <= 3 ? 1 : 2, gap).map((cell) => toSpec(cell)))
  return frames
}

function featureTop(count: number, gap: number): CollageFrameSpec[] {
  if (count === 1) return [toSpec(fullCell())]
  const featureHeight = 0.56
  const rest = count - 1
  const frames: CollageFrameSpec[] = [toSpec({ x: 0, y: 0, width: 1, height: featureHeight - gap / 2 })]
  frames.push(...cellsIn({ x: 0, y: featureHeight + gap / 2, width: 1, height: 1 - featureHeight - gap / 2 }, rest, rest <= 3 ? rest : Math.ceil(Math.sqrt(rest)), gap).map((cell) => toSpec(cell)))
  return frames
}

function magazine(count: number, gap: number): CollageFrameSpec[] {
  if (count === 1) return [toSpec(fullCell())]
  const leftWidth = 0.56
  const leftCount = Math.min(2, count)
  const left = cellsIn({ x: 0, y: 0, width: leftWidth - gap / 2, height: 1 }, leftCount, 1, gap)
  const rest = count - leftCount
  const right = rest > 0
    ? cellsIn({ x: leftWidth + gap / 2, y: 0, width: 1 - leftWidth - gap / 2, height: 1 }, rest, rest <= 3 ? 1 : 2, gap)
    : []
  return [...left, ...right].map((cell) => toSpec(cell))
}

function editorialFrames(count: number, variant: number, gap: number): CollageFrameSpec[] {
  switch (variant % 5) {
    case 0:
      return featureLeft(count, gap)
    case 1:
      return featureTop(count, gap)
    case 2:
      return bspFrames(count, 1103 + count * 37, gap, false)
    case 3:
      return magazine(count, gap)
    default:
      return bspFrames(count, 2207 + count * 53, gap, true)
  }
}

function luxuryFrames(count: number, variant: number, gap: number): CollageFrameSpec[] {
  const shapes: MaskShape[] = ['arch', 'circle', 'diamond', 'rounded', 'hexagon']
  const shape = shapes[variant % shapes.length]
  const cells = gridFrames(count, variant === 4 ? 1 : 0, gap * 2.2)
  return cells.map((frame, index) => {
    const mask = variant === 4 ? shapes[index % shapes.length] : shape
    const radius = mask === 'rounded' ? 0.22 : 0
    return { ...frame, mask, ...(radius ? { radius } : {}) }
  })
}

function polaroidFrames(count: number, variant: number, gap: number): CollageFrameSpec[] {
  const columns = variant === 4 ? Math.min(count, 2) : variant === 2 ? Math.min(count, 3) : Math.min(count, Math.ceil(Math.sqrt(count)))
  const cells = cellsIn(fullCell(), count, columns, gap * 2.6)
  const rand = seededRandom(4409 + variant * 97 + count)
  return cells.map((cell, index) => {
    const tilt = variant === 0 ? (index % 2 === 0 ? -1.8 : 1.8) : (rand() - 0.5) * (variant === 3 ? 7 : 4.5)
    const spread = variant === 3 ? 0.018 : 0.008
    return toSpec(inset(cell, spread), { angle: round(tilt), mask: 'rounded', radius: 0.02 })
  })
}

function bandedCells(count: number, vertical: boolean, gap: number): Cell[] {
  const out: Cell[] = []
  const size = (1 - gap * (count - 1)) / count
  for (let i = 0; i < count; i++) {
    out.push(vertical
      ? { x: 0, y: i * (size + gap), width: 1, height: size }
      : { x: i * (size + gap), y: 0, width: size, height: 1 })
  }
  return out
}

function diagonalFrames(count: number, variant: number, gap: number): CollageFrameSpec[] {
  if (variant === 0) {
    return bandedCells(count, false, gap).map((cell, i) => toSpec(inset(cell, gap), { angle: i % 2 === 0 ? -3.2 : 3.2 }))
  }
  if (variant === 1) {
    return bandedCells(count, true, gap).map((cell, i) => toSpec(inset(cell, gap), { angle: i % 2 === 0 ? 3.2 : -3.2 }))
  }
  const columns = variant === 4 ? Math.min(count, 3) : columnsFor(count)
  const cells = cellsIn(fullCell(), count, columns, gap)
  const rand = seededRandom(5501 + variant * 131 + count)
  return cells.map((cell, index) => {
    const base = variant === 2 ? 4.5 : variant === 3 ? 6 : 3
    const tilt = (index % 2 === 0 ? -1 : 1) * base + (rand() - 0.5) * 1.5
    return toSpec(inset(cell, gap * 0.8), { angle: round(tilt) })
  })
}

/** Offset rows, so hexagons and circles interlock instead of sitting on a plain grid. */
function honeycombCells(count: number, columns: number, gap: number): Cell[] {
  const cols = clamp(Math.round(columns), 1, Math.max(1, count))
  const rows = Math.ceil(count / cols)
  const width = Math.max(0.001, (1 - gap * (cols - 1) - gap * 0.45) / (cols + 0.45))
  const height = Math.max(0.001, (1 - gap * (rows - 1)) / rows)
  const out: Cell[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    const shift = row % 2 === 0 ? 0 : width * 0.5
    out.push({
      x: clamp(shift + col * (width + gap), 0, Math.max(0, 1 - width)),
      y: row * (height + gap),
      width,
      height,
    })
  }
  return out
}

function honeycombFrames(count: number, variant: number, gap: number): CollageFrameSpec[] {
  const columns = variant === 3 ? Math.min(count, 4) : Math.min(count, Math.ceil(Math.sqrt(count)) + (count > 4 ? 1 : 0))
  const cells = honeycombCells(count, columns, gap * 1.8)
  const shapes: MaskShape[] = variant === 0 ? ['hexagon'] : variant === 1 ? ['hexagon'] : variant === 2 ? ['circle'] : variant === 3 ? ['diamond'] : ['hexagon', 'circle', 'diamond', 'star']
  return cells.map((cell, index) => toSpec(cell, { mask: shapes[index % shapes.length] }))
}

function filmstripFrames(count: number, variant: number, gap: number): CollageFrameSpec[] {
  if (variant === 0) {
    return bandedCells(count, true, gap * 1.6).map((cell) => toSpec(inset(cell, gap * 0.6)))
  }
  if (variant === 3) {
    return bandedCells(count, false, gap * 1.6).map((cell) => toSpec(inset(cell, gap * 0.6)))
  }
  if (variant === 2) {
    // Timeline: alternating sides with a generous gutter down the middle.
    const height = (1 - gap * (count - 1)) / count
    return Array.from({ length: count }, (_, index) => {
      const wide = index % 3 === 0
      const width = wide ? 0.74 : 0.58
      return toSpec({ x: index % 2 === 0 ? 0 : 1 - width, y: index * (height + gap), width, height })
    })
  }
  const columns = variant === 1 ? Math.min(count, Math.max(1, Math.ceil(count / 2))) : Math.min(count, 4)
  return cellsIn(fullCell(), count, columns, gap * 1.1).map((cell) => toSpec(cell))
}

function recipeFrames(count: number, variant: number, gap: number): CollageFrameSpec[] {
  switch (variant % 5) {
    case 1:
      return bspFrames(count, hashSeed(`mondrian-${count}`), gap, true)
    case 2:
      return goldenSpiralFrames(count, hashSeed(`spiral-${count}`), gap)
    case 3:
      return generateProcedural(hashSeed(`surprise-${count}`), count, 'auto', gap)
    default:
      return bspFrames(count, hashSeed(`bsp-${count}`), gap, false)
  }
}

function framesFor(category: CollageCategoryId, count: number, variant: number, gap: number): CollageFrameSpec[] {
  switch (category) {
    case 'grids':
      return gridFrames(count, variant, gap)
    case 'editorial':
      return editorialFrames(count, variant, gap)
    case 'luxury':
      return luxuryFrames(count, variant, gap)
    case 'polaroid':
      return polaroidFrames(count, variant, gap)
    case 'diagonal':
      return diagonalFrames(count, variant, gap)
    case 'honeycomb':
      return honeycombFrames(count, variant, gap)
    case 'filmstrip':
      return filmstripFrames(count, variant, gap)
    case 'procedural':
    default:
      return recipeFrames(count, variant, gap)
  }
}

function buildCatalog(): CollagePreset[] {
  const out: CollagePreset[] = []
  for (const category of COLLAGE_CATEGORIES) {
    const names = VARIANT_NAMES[category.id]
    for (let count = COLLAGE_MIN_COUNT; count <= COLLAGE_MAX_COUNT; count++) {
      for (let variant = 0; variant < names.length; variant++) {
        out.push({
          id: `${category.id}-${count}-${variant}`,
          name: `${category.label} · ${names[variant]}`,
          category: category.id,
          count,
          frames: framesFor(category.id, count, variant, 0.014),
        })
      }
    }
  }
  return out
}

/** 8 categories x 16 photo counts x 5 variants = 640 ready-made layouts. */
export const COLLAGE_PRESETS: readonly CollagePreset[] = buildCatalog()

export function presetsFor(category: CollageCategoryId, count: number): CollagePreset[] {
  const n = clamp(Math.round(count), COLLAGE_MIN_COUNT, COLLAGE_MAX_COUNT)
  return COLLAGE_PRESETS.filter((preset) => preset.category === category && preset.count === n)
}
