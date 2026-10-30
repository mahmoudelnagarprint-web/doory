/**
 * Design Decomposer — real exemplar inpainting (Criminisi style).
 *
 * The hole's fill front is walked patch by patch. For the boundary patch with the highest priority
 * (confidence × data term) the best matching *known* patch nearby is found and its unknown pixels are
 * copied over; confidence is updated from the patch that was copied. Any pixel the exemplar passes did
 * not reach is finished by diffusion, and a nearest-known sweep guarantees that **every** masked pixel
 * ends up with a real value taken from its surroundings.
 *
 * Costs are bounded: the front is incremental (a patch's worth of neighbour checks per iteration, not a
 * full image scan), the source search is strided to at most `MAX_CANDIDATES` positions, and the number
 * of exemplar iterations is capped (`MAX_ITERATIONS`) with diffusion finishing the rest.
 *
 * DOM-free: plain typed arrays, so it runs in jsdom and in a worker.
 */
import type { InpaintOptions, InpaintProvider, PixelMask, Raster } from './types'

/** Patch radius for the exemplar search; the patch is `2r+1` square. */
export const DEFAULT_PATCH_RADIUS = 4
/** How far around the fill front the source patch may be looked for. */
export const DEFAULT_SEARCH_RADIUS = 32
/** Hard cap on exemplar iterations; the remainder is finished by diffusion (see the module header). */
const MAX_ITERATIONS = 3072
/** Hard cap on source positions evaluated per iteration (the window is strided down to this). */
const MAX_CANDIDATES = 512
/** Hard cap on diffusion passes before the nearest-known sweep takes over. */
const MAX_DIFFUSION_PASSES = 96

function clampInt(value: number, low: number, high: number): number {
  const rounded = Math.floor(Number.isFinite(value) ? value : low)
  return Math.max(low, Math.min(high, rounded))
}

function hasKnownNeighbour(index: number, known: Uint8Array, width: number, height: number): boolean {
  const x = index % width
  const y = (index - x) / width
  for (let dy = -1; dy <= 1; dy++) {
    const ny = y + dy
    if (ny < 0 || ny >= height) continue
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      if (nx < 0 || nx >= width) continue
      if (known[ny * width + nx] === 1) return true
    }
  }
  return false
}

/**
 * Which of the four axis neighbours are known, packed as `1 | 2 | 4 | 8` (right, left, down, up).
 * Used for both the isophote gradient and the fill front normal.
 */
function knownSides(index: number, known: Uint8Array, width: number, height: number): number {
  const x = index % width
  const y = (index - x) / width
  let sides = 0
  if (x + 1 < width && known[index + 1] === 1) sides |= 1
  if (x > 0 && known[index - 1] === 1) sides |= 2
  if (y + 1 < height && known[index + width] === 1) sides |= 4
  if (y > 0 && known[index - width] === 1) sides |= 8
  return sides
}

function luminance(data: Uint8ClampedArray, index: number): number {
  const at = index * 4
  return 0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2]
}

/**
 * Confidence term: the share of the patch that is already known (known pixels carry confidence 1,
 * unknown 0, copied pixels carry the confidence of the patch that produced them).
 */
function confidenceTerm(
  index: number,
  confidence: Float32Array,
  width: number,
  height: number,
  radius: number,
): number {
  const x = index % width
  const y = (index - x) / width
  let sum = 0
  let area = 0
  for (let dy = -radius; dy <= radius; dy++) {
    const ny = y + dy
    if (ny < 0 || ny >= height) continue
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx
      if (nx < 0 || nx >= width) continue
      sum += confidence[ny * width + nx]
      area++
    }
  }
  return area > 0 ? sum / area : 0
}

/**
 * Data term: `|isophote · frontNormal| / 255`. The isophote runs along the image gradient, the front
 * normal points from the unknown side into the known side, so a strong edge arriving at the front
 * scores high and linear structure (a roof line, a gradient) is carried across the hole first.
 */
function dataTerm(
  index: number,
  known: Uint8Array,
  data: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const sides = knownSides(index, known, width, height)
  if (sides === 0) return 0
  const centre = luminance(data, index)
  let gx = 0
  if ((sides & 1) !== 0 && (sides & 2) !== 0) gx = (luminance(data, index + 1) - luminance(data, index - 1)) / 2
  else if ((sides & 1) !== 0) gx = luminance(data, index + 1) - centre
  else if ((sides & 2) !== 0) gx = centre - luminance(data, index - 1)
  let gy = 0
  if ((sides & 4) !== 0 && (sides & 8) !== 0) gy = (luminance(data, index + width) - luminance(data, index - width)) / 2
  else if ((sides & 4) !== 0) gy = luminance(data, index + width) - centre
  else if ((sides & 8) !== 0) gy = centre - luminance(data, index - width)
  const nx = ((sides & 1) !== 0 ? 1 : 0) - ((sides & 2) !== 0 ? 1 : 0)
  const ny = ((sides & 4) !== 0 ? 1 : 0) - ((sides & 8) !== 0 ? 1 : 0)
  const norm = Math.sqrt(nx * nx + ny * ny)
  if (norm === 0) return 0
  return Math.min(1, Math.abs(gx * ny - gy * nx) / (255 * norm))
}

/**
 * Sum of squared RGB differences between a target patch and a fully known source patch, compared only
 * over the target positions that are already known: comparing the unknown (still arbitrary) pixels too
 * would bias the match towards whatever their placeholder value happens to be — for a black hole, the
 * darkest patch in the search window.
 *
 * Returns `Infinity` when the source patch is not fully known, and stops as soon as `limit` is
 * exceeded (the caller only cares whether it can beat its current best).
 */
function patchError(
  targetCentre: number,
  sourceCentre: number,
  known: Uint8Array,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  limit: number,
): number {
  const tx = targetCentre % width
  const ty = (targetCentre - tx) / width
  const sx = sourceCentre % width
  const sy = (sourceCentre - sx) / width
  let error = 0
  for (let dy = -radius; dy <= radius; dy++) {
    const ny = ty + dy
    if (ny < 0 || ny >= height) continue
    const targetRow = ny * width
    const sourceRow = (sy + dy) * width
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = tx + dx
      if (nx < 0 || nx >= width) continue
      const sourceIndex = sourceRow + sx + dx
      if (known[sourceIndex] === 0) return Infinity
      const targetIndex = targetRow + nx
      if (known[targetIndex] === 0) continue
      const at = targetIndex * 4
      const from = sourceIndex * 4
      const dr = data[at] - data[from]
      const dg = data[at + 1] - data[from + 1]
      const db = data[at + 2] - data[from + 2]
      error += dr * dr + dg * dg + db * db
      if (error >= limit) return error
    }
  }
  return error
}

/** Fills the still-unknown pixels of a patch window by inverse-distance diffusion from the known pixels
 * inside that window (alternating with a compact Gauss-Seidel relaxation), and marks them known. */
function diffusePatch(
  centre: number,
  radius: number,
  known: Uint8Array,
  data: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const cx = centre % width
  const cy = (centre - cx) / width
  const x0 = Math.max(0, cx - radius)
  const y0 = Math.max(0, cy - radius)
  const x1 = Math.min(width - 1, cx + radius)
  const y1 = Math.min(height - 1, cy + radius)
  const spanX = x1 - x0 + 1
  const size = spanX * (y1 - y0 + 1)
  const values = new Float32Array(size * 4)
  const present = new Uint8Array(size)
  const slotOf = (x: number, y: number): number => (y - y0) * spanX + (x - x0)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = y * width + x
      if (known[index] === 0) continue
      const slot = slotOf(x, y)
      present[slot] = 1
      const source = index * 4
      values[slot * 4] = data[source]
      values[slot * 4 + 1] = data[source + 1]
      values[slot * 4 + 2] = data[source + 2]
      values[slot * 4 + 3] = data[source + 3]
    }
  }
  const passes = 2 * radius + 2
  for (let pass = 0; pass < passes; pass++) {
    let changed = 0
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const slot = slotOf(x, y)
        if (present[slot] !== 0) continue
        let sumR = 0
        let sumG = 0
        let sumB = 0
        let sumA = 0
        let weight = 0
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny < y0 || ny > y1) continue
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx
            if (nx < x0 || nx > x1) continue
            const near = slotOf(nx, ny)
            if (present[near] === 0) continue
            const w = dx === 0 || dy === 0 ? 1 : Math.SQRT1_2
            sumR += values[near * 4] * w
            sumG += values[near * 4 + 1] * w
            sumB += values[near * 4 + 2] * w
            sumA += values[near * 4 + 3] * w
            weight += w
          }
        }
        if (weight === 0) continue
        values[slot * 4] = sumR / weight
        values[slot * 4 + 1] = sumG / weight
        values[slot * 4 + 2] = sumB / weight
        values[slot * 4 + 3] = sumA / weight
        present[slot] = 2
        changed++
      }
    }
    for (let i = 0; i < present.length; i++) if (present[i] === 2) present[i] = 1
    if (changed === 0) break
  }
  let filled = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = y * width + x
      if (known[index] === 1) continue
      const slot = slotOf(x, y)
      if (present[slot] === 0) continue
      const target = index * 4
      data[target] = Math.round(values[slot * 4])
      data[target + 1] = Math.round(values[slot * 4 + 1])
      data[target + 2] = Math.round(values[slot * 4 + 2])
      data[target + 3] = Math.round(values[slot * 4 + 3])
      known[index] = 1
      filled++
    }
  }
  return filled
}

/** Finishes the hole by Gauss-Seidel diffusion: each unknown pixel becomes a weighted average of its known neighbours. */
function diffuseResidual(
  known: Uint8Array,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  remaining: number,
): number {
  const total = width * height
  let left = remaining
  for (let pass = 0; pass < MAX_DIFFUSION_PASSES && left > 0; pass++) {
    let filled = 0
    const reverse = pass % 2 === 1
    for (let step = 0; step < total; step++) {
      const index = reverse ? total - 1 - step : step
      if (known[index] === 1) continue
      const x = index % width
      const y = (index - x) / width
      let sumR = 0
      let sumG = 0
      let sumB = 0
      let sumA = 0
      let weight = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const near = ny * width + nx
          if (known[near] === 0) continue
          const w = dx === 0 || dy === 0 ? 1 : Math.SQRT1_2
          const at = near * 4
          sumR += data[at] * w
          sumG += data[at + 1] * w
          sumB += data[at + 2] * w
          sumA += data[at + 3] * w
          weight += w
        }
      }
      if (weight === 0) continue
      const target = index * 4
      data[target] = Math.round(sumR / weight)
      data[target + 1] = Math.round(sumG / weight)
      data[target + 2] = Math.round(sumB / weight)
      data[target + 3] = Math.round(sumA / weight)
      known[index] = 1
      filled++
      left--
    }
    if (filled === 0) break
  }
  return left
}

/**
 * Last resort for pixels no exemplar patch and no diffusion pass reached: the colour of the nearest
 * known pixel, propagated outwards breadth first. Together with the passes above this makes "no masked
 * pixel is left untouched" a guarantee whenever at least one pixel of the image is known.
 */
function nearestKnownSweep(
  known: Uint8Array,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  remaining: number,
): number {
  if (remaining <= 0) return 0
  const total = width * height
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  for (let index = 0; index < total; index++) {
    if (known[index] === 1 && hasKnownNeighbour(index, known, width, height)) queue[tail++] = index
  }
  if (tail === 0) return 0
  let filled = 0
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = (index - x) / width
    const source = index * 4
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy
      if (ny < 0 || ny >= height) continue
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        if (nx < 0 || nx >= width) continue
        const next = ny * width + nx
        if (known[next] === 1) continue
        const target = next * 4
        data[target] = data[source]
        data[target + 1] = data[source + 1]
        data[target + 2] = data[source + 2]
        data[target + 3] = data[source + 3]
        known[next] = 1
        filled++
        queue[tail++] = next
      }
    }
  }
  return filled
}

/**
 * Criminisi-style exemplar fill. Returns a **new** raster; the input is never touched. Every pixel the
 * mask covers is written with a value copied or diffused from real surroundings. When the mask covers
 * the whole image there is no source pixel at all, and the untouched copy is returned: that degenerate
 * case is reported by the caller rather than dressed up as a reconstruction.
 */
export function inpaintExemplar(raster: Raster, mask: PixelMask, options: InpaintOptions = {}): Raster {
  const width = raster.width
  const height = raster.height
  const data = new Uint8ClampedArray(raster.data.length)
  data.set(raster.data)
  const total = Math.min(width * height, Math.floor(data.length / 4))
  if (total <= 0) return { width, height, data }

  const patchRadius = clampInt(options.patchRadius ?? DEFAULT_PATCH_RADIUS, 1, 16)
  const searchRadius = clampInt(options.searchRadius ?? DEFAULT_SEARCH_RADIUS, patchRadius, 128)

  const known = new Uint8Array(total)
  const confidence = new Float32Array(total)
  let knownCount = 0
  const hole: number[] = []
  for (let index = 0; index < total; index++) {
    const covered = index < mask.length && mask[index] > 0
    if (covered) {
      hole.push(index)
    } else {
      known[index] = 1
      confidence[index] = 1
      knownCount++
    }
  }
  if (hole.length === 0) return { width, height, data }
  if (knownCount === 0) return { width, height, data }

  let remaining = hole.length
  const holeIndices = Int32Array.from(hole)

  // Incremental fill front: a pixel is on the front while it is unknown and touches a known pixel. The
  // known set only grows, so a front entry stops being one exactly when it gets filled; new entries are
  // the unknown neighbours of freshly filled pixels. No full image scan per iteration.
  let frontA = new Int32Array(total)
  let frontB = new Int32Array(total)
  let frontCount = 0
  const inFront = new Uint8Array(total)
  for (let i = 0; i < holeIndices.length; i++) {
    const index = holeIndices[i]
    if (hasKnownNeighbour(index, known, width, height)) {
      frontA[frontCount++] = index
      inFront[index] = 1
    }
  }

  const patchSpan = 2 * patchRadius + 1
  const searchSpan = 2 * searchRadius + 1
  const stride = Math.max(1, Math.ceil(Math.sqrt((searchSpan * searchSpan) / MAX_CANDIDATES)))
  const newlyFilled = new Int32Array(patchSpan * patchSpan)

  let iterations = 0
  while (remaining > 0 && frontCount > 0 && iterations < MAX_ITERATIONS) {
    iterations++

    // 1. Highest priority patch on the fill front: confidence × data term.
    let bestIndex = -1
    let bestKey = -1
    for (let i = 0; i < frontCount; i++) {
      const index = frontA[i]
      if (known[index] === 1) continue
      const confidenceValue = confidenceTerm(index, confidence, width, height, patchRadius)
      const dataValue = dataTerm(index, known, data, width, height)
      const key = confidenceValue * dataValue + confidenceValue * 1e-6
      if (key > bestKey) {
        bestKey = key
        bestIndex = index
      }
    }
    if (bestIndex < 0) break

    const bestX = bestIndex % width
    const bestY = (bestIndex - bestX) / width

    // 2. Best matching fully known source patch inside the search window. The window is strided so the
    //    number of candidates stays bounded, then refined at stride 1 around the coarse winner.
    let source = -1
    let sourceError = Infinity
    let bestOffsetX = 0
    let bestOffsetY = 0
    const consider = (ox: number, oy: number): void => {
      const cx = bestX + ox
      const cy = bestY + oy
      if (cx - patchRadius < 0 || cx + patchRadius >= width) return
      if (cy - patchRadius < 0 || cy + patchRadius >= height) return
      const candidate = cy * width + cx
      if (candidate === bestIndex) return
      const error = patchError(bestIndex, candidate, known, data, width, height, patchRadius, sourceError)
      if (error >= sourceError) return
      sourceError = error
      source = candidate
      bestOffsetX = ox
      bestOffsetY = oy
    }
    for (let oy = -searchRadius; oy <= searchRadius && sourceError > 0; oy += stride) {
      for (let ox = -searchRadius; ox <= searchRadius && sourceError > 0; ox += stride) consider(ox, oy)
    }
    if (source >= 0 && stride > 1) {
      for (let oy = bestOffsetY - stride + 1; oy <= bestOffsetY + stride - 1; oy++) {
        if (oy < -searchRadius || oy > searchRadius) continue
        for (let ox = bestOffsetX - stride + 1; ox <= bestOffsetX + stride - 1; ox++) {
          if (ox < -searchRadius || ox > searchRadius) continue
          consider(ox, oy)
        }
      }
    }

    // 3. Copy the source patch's unknown pixels, or diffuse this patch when no clean source exists.
    let filledCount = 0
    if (source >= 0) {
      const sourceX = source % width
      const sourceY = (source - sourceX) / width
      const confidenceValue = confidenceTerm(bestIndex, confidence, width, height, patchRadius)
      for (let dy = -patchRadius; dy <= patchRadius; dy++) {
        const ty = bestY + dy
        if (ty < 0 || ty >= height) continue
        const targetRow = ty * width
        const sourceRow = (sourceY + dy) * width
        for (let dx = -patchRadius; dx <= patchRadius; dx++) {
          const tx = bestX + dx
          if (tx < 0 || tx >= width) continue
          const target = targetRow + tx
          if (known[target] === 1) continue
          const from = (sourceRow + sourceX + dx) * 4
          const to = target * 4
          data[to] = data[from]
          data[to + 1] = data[from + 1]
          data[to + 2] = data[from + 2]
          data[to + 3] = data[from + 3]
          known[target] = 1
          confidence[target] = confidenceValue
          newlyFilled[filledCount++] = target
          remaining--
        }
      }
    } else {
      filledCount = diffusePatch(bestIndex, patchRadius, known, data, width, height)
      remaining -= filledCount
      if (filledCount > 0) {
        // The diffusion has no individual pixel list; seed the front rebuild with the whole window.
        let slot = 0
        const x0 = Math.max(0, bestX - patchRadius)
        const x1 = Math.min(width - 1, bestX + patchRadius)
        const y0 = Math.max(0, bestY - patchRadius)
        const y1 = Math.min(height - 1, bestY + patchRadius)
        for (let y = y0; y <= y1 && slot < newlyFilled.length; y++) {
          for (let x = x0; x <= x1 && slot < newlyFilled.length; x++) newlyFilled[slot++] = y * width + x
        }
      }
    }
    if (filledCount === 0) break

    // 4. Rebuild the front: surviving entries plus unknown neighbours of the freshly filled pixels.
    let next = 0
    for (let i = 0; i < frontCount; i++) {
      const index = frontA[i]
      if (known[index] === 1) {
        inFront[index] = 0
        continue
      }
      frontB[next++] = index
    }
    for (let f = 0; f < filledCount && f < newlyFilled.length; f++) {
      const index = newlyFilled[f]
      const x = index % width
      const y = (index - x) / width
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const neighbour = ny * width + nx
          if (known[neighbour] === 1 || inFront[neighbour] === 1) continue
          if (!hasKnownNeighbour(neighbour, known, width, height)) continue
          inFront[neighbour] = 1
          frontB[next++] = neighbour
        }
      }
    }
    frontCount = next
    const swap = frontA
    frontA = frontB
    frontB = swap
  }

  // 5. Nothing masked may stay untouched: diffusion, then the nearest known pixel as the final guarantee.
  remaining = diffuseResidual(known, data, width, height, remaining)
  nearestKnownSweep(known, data, width, height, remaining)
  return { width, height, data }
}

/** The shipped classical inpaint engine: always available, never claims to be neural. */
export const exemplarInpaintProvider: InpaintProvider = {
  id: 'exemplar',
  neural: false,
  isAvailable: async () => true,
  inpaint: async (raster, mask, options) => inpaintExemplar(raster, mask, options),
}
