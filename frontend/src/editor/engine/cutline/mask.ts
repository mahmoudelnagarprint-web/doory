/**
 * Raster helpers for cut lines: turn a rendered object's alpha into a binary mask, grow it by a
 * bleed (exact Euclidean distance) and turn the mask into the black/white image ImageTracer reads.
 */

/** Pixels at least this opaque belong to the object. Keeps anti-aliased fringes out of the trace. */
export const ALPHA_THRESHOLD = 16

const INF = 1e20

/** A plain RGBA image, as much of `ImageData` as ImageTracer reads. */
export interface RgbaImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Alpha channel to 1 (inside) / 0 (outside). */
export function alphaToMask(data: ArrayLike<number>, width: number, height: number, threshold = ALPHA_THRESHOLD): Uint8Array {
  const mask = new Uint8Array(width * height)
  const count = Math.min(mask.length, Math.floor(data.length / 4))
  for (let i = 0; i < count; i++) mask[i] = data[i * 4 + 3] >= threshold ? 1 : 0
  return mask
}

/** Number of set pixels (the object was visible at all). */
export function maskCount(mask: Uint8Array): number {
  let n = 0
  for (let i = 0; i < mask.length; i++) n += mask[i]
  return n
}

/**
 * Grow a mask outwards by `radius` pixels. A pixel is kept when its Euclidean distance to the nearest
 * original pixel is at most the radius; the distance transform is exact, so diagonal corners stay round.
 */
export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (!(radius > 0) || width <= 0 || height <= 0) return mask.slice()
  const n = width * height
  const f = new Float64Array(n)
  for (let i = 0; i < n; i++) f[i] = mask[i] ? 0 : INF
  const line = new Float64Array(Math.max(width, height))
  const v = new Int32Array(Math.max(width, height))
  const z = new Float64Array(Math.max(width, height) + 1)

  for (let y = 0; y < height; y++) {
    edt1d(f, line, width, y * width, 1, v, z)
    f.set(line.subarray(0, width), y * width)
  }
  for (let x = 0; x < width; x++) {
    edt1d(f, line, height, x, width, v, z)
    for (let y = 0; y < height; y++) f[y * width + x] = line[y]
  }

  const limit = radius * radius
  const grown = new Uint8Array(n)
  for (let i = 0; i < n; i++) grown[i] = f[i] <= limit ? 1 : 0
  return grown
}

/** One dimension of the squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, line: Float64Array, n: number, offset: number, step: number, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    const fq = f[offset + q * step]
    let s = (fq + q * q - (f[offset + v[k] * step] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (fq + q * q - (f[offset + v[k] * step] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    const d = q - v[k]
    line[q] = d * d + f[offset + v[k] * step]
  }
}

/** Black foreground on opaque white: ImageTracer's palette then has exactly two colours to find. */
export function maskToRgba(mask: Uint8Array, width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const value = mask[i] ? 0 : 255
    data[i * 4] = value
    data[i * 4 + 1] = value
    data[i * 4 + 2] = value
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

/** The black contours of an ImageTracer SVG, as SVG path data. */
export function blackPathsFromSvg(svg: string): string[] {
  const paths: string[] = []
  for (const match of svg.matchAll(/<path\b([^>]*)\/?>/g)) {
    const attrs = match[1]
    const fill = /fill="([^"]+)"/.exec(attrs)?.[1]?.replace(/\s/g, '').toLowerCase()
    if (fill !== 'rgb(0,0,0)' && fill !== '#000' && fill !== '#000000' && fill !== 'black') continue
    const d = /d="([^"]+)"/.exec(attrs)?.[1]
    if (d) paths.push(d)
  }
  return paths
}
