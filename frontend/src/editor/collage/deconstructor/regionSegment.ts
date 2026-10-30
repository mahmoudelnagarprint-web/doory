/**
 * Design Decomposer — region segmentation.
 *
 * A genuine, unsupervised segmenter: the background is estimated from the image border, everything far
 * enough from it becomes foreground, and the foreground is then split into connected components which
 * may be split further by colour so that a photo and a sticker touching each other become two layers.
 *
 * DOM-free (plain typed arrays), so it runs in jsdom and in a worker. Colour distance is Chebyshev —
 * the largest per channel difference, 0..255 — everywhere in this module, so `tolerance` and
 * `colorTolerance` mean the same thing to every caller.
 */
import { closeMask, maskArea, openMask } from './maskOps'
import type { PixelMask, PixelRect, Raster } from './types'

/** One isolated region: a full-raster-size binary mask plus the evidence the classifier needs. */
export interface SegmentedRegion {
  mask: PixelMask
  bounds: PixelRect
  area: number
  fillRatio: number
  meanColor: { r: number; g: number; b: number }
  touchesBorder: boolean
  confidence: number
}

export interface DecomposeOptions {
  /** Regions smaller than this many pixels are dropped. */
  minPixels: number
  /** Hard cap; strongest regions are kept. */
  maxRegions: number
  /** 0..255 RGB distance used to split a region into colour sub-regions. */
  colorTolerance: number
}

/** Default segmentation thresholds; callers may override every field. */
export const DEFAULT_DECOMPOSE_OPTIONS: DecomposeOptions = {
  minPixels: 48,
  maxRegions: 60,
  colorTolerance: 36,
}

/** Default distance (0..255) a pixel must be from the estimated background to count as foreground. */
export const DEFAULT_FOREGROUND_TOLERANCE = 36

/** Pixels with less opacity than this are treated as absent, not as black foreground. */
const ALPHA_FLOOR = 8

/** A component must cover at least this share of the image before colour splitting is worth trying. */
const SPLIT_MIN_AREA_FRACTION = 0.01

/** Upper bound on colour clusters per component: keeps the split bounded and deterministic. */
const MAX_COLOR_CLUSTERS = 6

/** Largest cluster share above which a "split" is really just noise cut off the dominant colour. */
const SPLIT_DOMINANT_SHARE = 0.9

/** Chebyshev RGB distance (max per channel difference), 0..255. */
export function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  values.sort((left, right) => left - right)
  const middle = values.length >> 1
  return values.length % 2 === 1 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2)
}

/**
 * Estimates the background colour from the image border: the median of the opaque border pixels per
 * channel, which is robust against a few ornaments touching the edge. Falls back to the median of the
 * whole image when the border is fully transparent, and to white when there is nothing visible at all.
 */
export function estimateBackgroundColor(raster: Raster): { r: number; g: number; b: number } {
  const { width, height, data } = raster
  const border: number[] = []
  const every: number[] = []
  const pixels = Math.min(width * height, Math.floor(data.length / 4))
  const collect = (index: number, into: number[]): void => {
    const at = index * 4
    if (data[at + 3] < ALPHA_FLOOR) return
    into.push(data[at], data[at + 1], data[at + 2])
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      if (index >= pixels) break
      const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1
      collect(index, onBorder ? border : every)
    }
  }
  const source = border.length > 0 ? border : every
  if (source.length === 0) return { r: 255, g: 255, b: 255 }
  const reds: number[] = []
  const greens: number[] = []
  const blues: number[] = []
  for (let i = 0; i < source.length; i += 3) {
    reds.push(source[i])
    greens.push(source[i + 1])
    blues.push(source[i + 2])
  }
  return { r: median(reds), g: median(greens), b: median(blues) }
}

/**
 * Marks every pixel that is sufficiently far from the background as foreground (Chebyshev distance
 * `> tolerance`). Not a bounding box and not a threshold on luminance: the distance is measured per
 * pixel against the colour estimated from the border, so a light sticker on a light background is
 * still found when its hue differs.
 */
export function classicalForeground(
  raster: Raster,
  background: { r: number; g: number; b: number } = estimateBackgroundColor(raster),
  tolerance: number = DEFAULT_FOREGROUND_TOLERANCE,
): PixelMask {
  const { width, height, data } = raster
  const total = Math.max(0, width * height)
  const mask = new Uint8Array(total)
  const limit = Math.max(0, Math.round(tolerance))
  const pixels = Math.min(total, Math.floor(data.length / 4))
  for (let i = 0; i < pixels; i++) {
    const at = i * 4
    if (data[at + 3] < ALPHA_FLOOR) continue
    const distance = Math.max(
      Math.abs(data[at] - background.r),
      Math.abs(data[at + 1] - background.g),
      Math.abs(data[at + 2] - background.b),
    )
    if (distance > limit) mask[i] = 255
  }
  return mask
}

interface Draft {
  pixels: Int32Array
  bounds: PixelRect
  area: number
  meanColor: { r: number; g: number; b: number }
  /** Mean Chebyshev distance of the region's pixels to its own mean colour. */
  colorSpread: number
  touchesBorder: boolean
}

interface Stats {
  bounds: PixelRect
  area: number
  meanColor: { r: number; g: number; b: number }
  colorSpread: number
  touchesBorder: boolean
}

function isOnBorder(x: number, y: number, width: number, height: number): boolean {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1
}

/** Bounding box, mean colour, colour spread and border contact of one pixel set (all O(pixels)). */
function statsOf(
  pixels: Int32Array,
  raster: Raster,
  width: number,
  height: number,
): Stats {
  const data = raster.data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let touchesBorder = false
  for (let i = 0; i < pixels.length; i++) {
    const index = pixels[i]
    const x = index % width
    const y = (index - x) / width
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (!touchesBorder && isOnBorder(x, y, width, height)) touchesBorder = true
    const at = index * 4
    sumR += data[at]
    sumG += data[at + 1]
    sumB += data[at + 2]
  }
  const count = pixels.length
  const meanColor = {
    r: Math.round(sumR / count),
    g: Math.round(sumG / count),
    b: Math.round(sumB / count),
  }
  let spread = 0
  for (let i = 0; i < count; i++) {
    const at = pixels[i] * 4
    spread += Math.max(
      Math.abs(data[at] - meanColor.r),
      Math.abs(data[at + 1] - meanColor.g),
      Math.abs(data[at + 2] - meanColor.b),
    )
  }
  return {
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    area: count,
    meanColor,
    colorSpread: count > 0 ? spread / count : 0,
    touchesBorder,
  }
}

interface ColorCluster {
  /** Indices into the pixel array this clustering ran over. */
  members: number[]
  red: number
  green: number
  blue: number
  spread: number
}

/**
 * Greedy leader clustering over the component's pixels, then Lloyd refinement.
 *
 * Greedy leader pass: every pixel joins the nearest existing centroid when it is within
 * `colorTolerance` (Chebyshev), otherwise it starts a new cluster until `maxClusters` is reached.
 * Two Lloyd passes then recompute the centroids and re-assign every pixel to the nearest one, which
 * makes the result independent of the scan order for well separated colour modes.
 */
function clusterByColor(
  pixels: Int32Array,
  raster: Raster,
  colorTolerance: number,
): ColorCluster[] {
  const data = raster.data
  const count = pixels.length
  const assignment = new Int32Array(count)
  const centroids: number[] = []
  const clusterCount = (): number => centroids.length / 3
  const nearest = (r: number, g: number, b: number): { index: number; distance: number } => {
    let best = 0
    let bestDistance = Infinity
    for (let c = 0; c < clusterCount(); c++) {
      const distance = Math.max(
        Math.abs(r - centroids[c * 3]),
        Math.abs(g - centroids[c * 3 + 1]),
        Math.abs(b - centroids[c * 3 + 2]),
      )
      if (distance < bestDistance) {
        bestDistance = distance
        best = c
      }
    }
    return { index: best, distance: bestDistance }
  }
  for (let i = 0; i < count; i++) {
    const at = pixels[i] * 4
    const r = data[at]
    const g = data[at + 1]
    const b = data[at + 2]
    if (clusterCount() === 0) {
      centroids.push(r, g, b)
      assignment[i] = 0
      continue
    }
    const found = nearest(r, g, b)
    if (found.distance > colorTolerance && clusterCount() < MAX_COLOR_CLUSTERS) {
      centroids.push(r, g, b)
      assignment[i] = clusterCount() - 1
    } else {
      assignment[i] = found.index
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const sums = new Float64Array(clusterCount() * 3)
    const counts = new Int32Array(clusterCount())
    for (let i = 0; i < count; i++) {
      const at = pixels[i] * 4
      const c = assignment[i]
      sums[c * 3] += data[at]
      sums[c * 3 + 1] += data[at + 1]
      sums[c * 3 + 2] += data[at + 2]
      counts[c]++
    }
    for (let c = 0; c < clusterCount(); c++) {
      if (counts[c] === 0) continue
      centroids[c * 3] = sums[c * 3] / counts[c]
      centroids[c * 3 + 1] = sums[c * 3 + 1] / counts[c]
      centroids[c * 3 + 2] = sums[c * 3 + 2] / counts[c]
    }
    for (let i = 0; i < count; i++) {
      const at = pixels[i] * 4
      assignment[i] = nearest(data[at], data[at + 1], data[at + 2]).index
    }
  }

  const clusters: ColorCluster[] = []
  for (let c = 0; c < clusterCount(); c++) clusters.push({ members: [], red: 0, green: 0, blue: 0, spread: 0 })
  for (let i = 0; i < count; i++) clusters[assignment[i]].members.push(pixels[i])
  for (const cluster of clusters) {
    const size = cluster.members.length
    if (size === 0) continue
    let sumR = 0
    let sumG = 0
    let sumB = 0
    for (const index of cluster.members) {
      const at = index * 4
      sumR += data[at]
      sumG += data[at + 1]
      sumB += data[at + 2]
    }
    cluster.red = sumR / size
    cluster.green = sumG / size
    cluster.blue = sumB / size
    let spread = 0
    for (const index of cluster.members) {
      const at = index * 4
      spread += Math.max(
        Math.abs(data[at] - cluster.red),
        Math.abs(data[at + 1] - cluster.green),
        Math.abs(data[at + 2] - cluster.blue),
      )
    }
    cluster.spread = spread / size
  }
  return clusters
}

/** Splits one component into colour sub-regions, or returns `null` when it is one single colour mass. */
function splitComponent(
  draft: Draft,
  raster: Raster,
  width: number,
  height: number,
  options: DecomposeOptions,
  totalPixels: number,
): Draft[] | null {
  if (draft.area < Math.max(options.minPixels * 2, SPLIT_MIN_AREA_FRACTION * totalPixels)) return null
  if (draft.colorSpread <= options.colorTolerance) return null
  const clusters = clusterByColor(draft.pixels, raster, options.colorTolerance)
  const surviving = clusters.filter((cluster) => cluster.members.length >= options.minPixels)
  if (surviving.length < 2) return null
  const largest = surviving.reduce((best, cluster) => Math.max(best, cluster.members.length), 0)
  if (largest >= draft.area * SPLIT_DOMINANT_SHARE) return null
  // Two modes must be genuinely tight and genuinely apart: a photograph has a broad colour
  // distribution, whose clusters are wide and overlapping, and must stay one layer.
  const tight = surviving.every((cluster) => cluster.spread <= options.colorTolerance * 1.5)
  if (!tight) return null
  let widest = 0
  for (let a = 0; a < surviving.length; a++) {
    for (let b = a + 1; b < surviving.length; b++) {
      widest = Math.max(
        widest,
        Math.max(
          Math.abs(surviving[a].red - surviving[b].red),
          Math.abs(surviving[a].green - surviving[b].green),
          Math.abs(surviving[a].blue - surviving[b].blue),
        ),
      )
    }
  }
  if (widest <= options.colorTolerance) return null
  return surviving.map((cluster) => {
    const pixels = Int32Array.from(cluster.members)
    return { pixels, ...statsOf(pixels, raster, width, height) }
  })
}

/**
 * Turns a foreground mask into independently editable regions.
 *
 * 1. cleans the mask (open then close, falling back to close-only when opening would eat the thin
 *    strokes that text and logos are made of),
 * 2. labels the 8-connected components,
 * 3. splits oversized, clearly multi-modal components by colour clustering (bounded by
 *    `colorTolerance` and at most `MAX_COLOR_CLUSTERS` clusters),
 * 4. drops everything below `minPixels`, sorts by area descending then bbox, and keeps `maxRegions`.
 *
 * A uniform image has no foreground at all and yields `[]`.
 */
export function decomposeRegions(
  raster: Raster,
  foreground: PixelMask,
  options: DecomposeOptions,
): SegmentedRegion[] {
  const width = raster.width
  const height = raster.height
  const totalPixels = width * height
  if (totalPixels <= 0 || foreground.length === 0) return []
  if (foreground.length !== totalPixels) {
    throw new RangeError(
      `decomposeRegions needs a foreground mask of ${totalPixels} bytes (${width}x${height}), got ${foreground.length}.`,
    )
  }
  const resolved: DecomposeOptions = {
    minPixels: Math.max(1, Math.floor(options.minPixels)),
    maxRegions: Math.max(1, Math.floor(options.maxRegions)),
    colorTolerance: Math.max(0, Math.min(255, Math.round(options.colorTolerance))),
  }

  const binary = new Uint8Array(totalPixels)
  for (let i = 0; i < totalPixels; i++) binary[i] = foreground[i] > 0 ? 255 : 0
  if (maskArea(binary) === 0) return []

  const opened = closeMask(openMask(binary, width, height, 1), width, height, 1)
  const cleaned = maskArea(opened) >= maskArea(binary) * 0.5 ? opened : closeMask(binary, width, height, 1)
  if (maskArea(cleaned) === 0) return []

  // 8-connected labelling; pixel indices of each component are kept so colour splitting is cheap.
  const visited = new Uint8Array(totalPixels)
  const stack = new Int32Array(totalPixels)
  const drafts: Draft[] = []
  for (let start = 0; start < totalPixels; start++) {
    if (visited[start] === 1 || cleaned[start] === 0) continue
    visited[start] = 1
    let top = 0
    stack[top++] = start
    const members: number[] = []
    while (top > 0) {
      const index = stack[--top]
      members.push(index)
      const x = index % width
      const y = (index - x) / width
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const next = ny * width + nx
          if (visited[next] === 1 || cleaned[next] === 0) continue
          visited[next] = 1
          stack[top++] = next
        }
      }
    }
    if (members.length < resolved.minPixels) continue
    const pixels = Int32Array.from(members)
    drafts.push({ pixels, ...statsOf(pixels, raster, width, height) })
  }

  const grouped: Draft[] = []
  for (const draft of drafts) {
    const split = splitComponent(draft, raster, width, height, resolved, totalPixels)
    if (split) grouped.push(...split)
    else grouped.push(draft)
  }

  const kept = grouped
    .filter((draft) => draft.area >= resolved.minPixels)
    .sort((left, right) => {
      if (right.area !== left.area) return right.area - left.area
      if (left.bounds.y !== right.bounds.y) return left.bounds.y - right.bounds.y
      if (left.bounds.x !== right.bounds.x) return left.bounds.x - right.bounds.x
      return right.bounds.width * right.bounds.height - left.bounds.width * left.bounds.height
    })
    .slice(0, resolved.maxRegions)

  return kept.map((draft) => {
    const mask = new Uint8Array(totalPixels)
    for (let i = 0; i < draft.pixels.length; i++) mask[draft.pixels[i]] = 255
    const box = draft.bounds.width * draft.bounds.height
    const fillRatio = box > 0 ? Math.min(1, draft.area / box) : 0
    const compactness = Math.max(0, 1 - draft.colorSpread / 128)
    return {
      mask,
      bounds: draft.bounds,
      area: draft.area,
      fillRatio,
      meanColor: draft.meanColor,
      touchesBorder: draft.touchesBorder,
      confidence: Math.max(0.05, Math.min(0.99, 0.6 * fillRatio + 0.4 * compactness)),
    }
  })
}

/** Re-exported so callers can describe a region's box without importing maskOps. */
export type { PixelRect }
