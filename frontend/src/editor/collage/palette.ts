/**
 * "Match colours to my photos", without a server and without a paid API.
 *
 * Each photo is drawn into a 16 x 16 offscreen canvas, so sampling is a few hundred pixels no matter
 * how large the upload is, and the colours are quantised before they become a theme. The five themes
 * are simple colour-wheel harmonies: a warm mat, a tonal set, analogous, complementary and a gallery
 * noir. Everything is pure except `samplePhoto`, which needs a browser canvas.
 *
 * Lazy-loaded by the panel.
 */
import type { CollageStyle, GradientStop, PageBackground } from '@/types/document'
import { hsvToRgb, parseColor, readableOn, rgbToHsv, rgbaToHex, type Rgba } from '../engine/colors'

export interface CollagePaletteTheme {
  id: string
  name: string
  /** Page background the theme suggests. */
  background: PageBackground
  /** Frame colours merged over the collage's current style. */
  style: Partial<CollageStyle>
  /** Readable title/badge colour on the background. */
  text: string
  /** Preview swatches, in order: background, mat, ring, accent. */
  swatches: string[]
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }
const GOLD: Rgba = { r: 212, g: 175, b: 55, a: 1 }
const MAT: Rgba = { r: 245, g: 239, b: 226, a: 1 }

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))
const hex = (c: Rgba): string => rgbaToHex({ ...c, a: 1 })

function mix(a: Rgba, b: Rgba, amount: number): Rgba {
  const t = clamp(amount, 0, 1)
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
    a: 1,
  }
}

function tone(h: number, s: number, v: number): Rgba {
  return hsvToRgb({ h, s: clamp(s, 0, 1), v: clamp(v, 0, 1), a: 1 })
}

/** Bucket-quantises pixels into at most `limit` representative colours, most common first. */
export function quantize(pixels: readonly Rgba[], limit = 8): Rgba[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (const pixel of pixels) {
    if (pixel.a < 0.35) continue
    // Ignore the near-white and near-black extremes that come from skies and shadows; they say
    // little about the photo's palette and would win every count.
    const max = Math.max(pixel.r, pixel.g, pixel.b)
    const min = Math.min(pixel.r, pixel.g, pixel.b)
    if (max > 250 && min > 244) continue
    if (max < 12) continue
    const key = ((pixel.r >> 4) << 8) | ((pixel.g >> 4) << 4) | (pixel.b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.r += pixel.r
      bucket.g += pixel.g
      bucket.b += pixel.b
      bucket.n++
    } else {
      buckets.set(key, { r: pixel.r, g: pixel.g, b: pixel.b, n: 1 })
    }
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, Math.max(1, limit))
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.n),
      g: Math.round(bucket.g / bucket.n),
      b: Math.round(bucket.b / bucket.n),
      a: 1,
    }))
}

/** Draws one photo into a 16 x 16 canvas and returns its pixels. Rejects when the image cannot load. */
export function samplePhoto(url: string): Promise<Rgba[]> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 16
        canvas.height = 16
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          reject(new Error('Canvas is not available'))
          return
        }
        // Cover the square: crop the longer side rather than stretching the picture.
        const source = image.naturalWidth > 0 && image.naturalHeight > 0
          ? { w: image.naturalWidth, h: image.naturalHeight }
          : { w: image.width || 16, h: image.height || 16 }
        const side = Math.min(source.w, source.h)
        ctx.drawImage(image, (source.w - side) / 2, (source.h - side) / 2, side, side, 0, 0, 16, 16)
        const data = ctx.getImageData(0, 0, 16, 16).data
        const pixels: Rgba[] = []
        for (let i = 0; i < data.length; i += 4) {
          pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] / 255 })
        }
        resolve(pixels)
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Could not read the photo'))
      }
    }
    image.onerror = () => reject(new Error('Could not load the photo'))
    image.src = url
  })
}

/** Samples every photo it can read; one unreadable asset never blocks the palette. */
export async function samplePhotos(urls: readonly string[]): Promise<Rgba[]> {
  const results = await Promise.allSettled(urls.slice(0, 12).map((url) => samplePhoto(url)))
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

function gradient(stops: readonly GradientStop[], angle = 135): PageBackground {
  return { type: 'gradient', kind: 'linear', angle, stops: stops.map((stop) => ({ ...stop })) }
}

/** The most vivid colour among the leading candidates; keeps an accent even in a muted photo. */
function accentOf(colors: readonly Rgba[], fallback: Rgba): { color: Rgba; hue: number } {
  let best = fallback
  let bestScore = -1
  for (const color of colors.slice(0, 5)) {
    const hsv = rgbToHsv(color)
    const score = hsv.s * (0.35 + hsv.v)
    if (score > bestScore) {
      best = color
      bestScore = score
    }
  }
  const hsv = rgbToHsv(best)
  if (hsv.s < 0.18) {
    return { color: tone(hsv.h, 0.62, 0.55), hue: hsv.h }
  }
  return { color: best, hue: hsv.h }
}

/** Builds five harmonious themes from quantised photo colours. Pure, so it is easy to test. */
export function buildThemes(colors: readonly Rgba[]): CollagePaletteTheme[] {
  const base = colors[0] ?? GOLD
  const hsv = rgbToHsv(base)
  const { color: accent, hue: accentHue } = accentOf(colors, base)
  const warmBase = mix(base, MAT, 0.72)
  const bright = tone(hsv.h, 0.12, 0.97)
  const soft = tone(hsv.h, 0.2, 0.9)
  const deep = tone(hsv.h, 0.42, 0.2)
  const analogousHue = (hsv.h + 28) % 360
  const complementHue = (hsv.h + 180) % 360
  const noir = tone(accentHue, 0.24, 0.12)
  const warmText = readableOn(hex(bright))
  const analogousText = readableOn(hex(tone(hsv.h, 0.25, 0.92)))
  const deepText = '#ffffff'
  const noirText = '#f5efe2'

  const warmBackground = gradient([
    { offset: 0, color: hex(mix(base, WHITE, 0.86)) },
    { offset: 1, color: hex(mix(warmBase, MAT, 0.35)) },
  ])
  const tonalBackground = gradient([
    { offset: 0, color: hex(bright) },
    { offset: 1, color: hex(soft) },
  ])
  const analogousBackground = gradient([
    { offset: 0, color: hex(tone(analogousHue, 0.32, 0.96)) },
    { offset: 1, color: hex(tone(hsv.h, 0.22, 0.88)) },
  ])
  const complementaryBackground = gradient([
    { offset: 0, color: hex(deep) },
    { offset: 1, color: hex(tone(complementHue, 0.35, 0.3)) },
  ])
  const noirBackground = gradient([
    { offset: 0, color: hex(noir) },
    { offset: 1, color: hex(tone(accentHue, 0.36, 0.24)) },
  ])

  return [
    {
      id: 'warm',
      name: 'Warm mat',
      background: warmBackground,
      style: { matColor: hex(warmBase), outerColor: hex(mix(accent, GOLD, 0.55)), innerColor: '#d4af37' },
      text: warmText,
      swatches: [hex(mix(base, WHITE, 0.86)), hex(warmBase), '#d4af37', hex(accent)],
    },
    {
      id: 'tonal',
      name: 'Tonal',
      background: tonalBackground,
      style: { matColor: hex(soft), outerColor: hex(tone(hsv.h, 0.45, 0.34)), innerColor: hex(tone(hsv.h, 0.6, 0.5)) },
      text: analogousText,
      swatches: [hex(bright), hex(soft), hex(tone(hsv.h, 0.6, 0.5)), hex(accent)],
    },
    {
      id: 'analogous',
      name: 'Analogous',
      background: analogousBackground,
      style: { matColor: hex(tone(hsv.h, 0.28, 0.86)), outerColor: hex(tone(analogousHue, 0.62, 0.46)), innerColor: hex(accent) },
      text: analogousText,
      swatches: [hex(tone(analogousHue, 0.32, 0.96)), hex(tone(hsv.h, 0.28, 0.86)), hex(accent), hex(tone(analogousHue, 0.62, 0.46))],
    },
    {
      id: 'complement',
      name: 'Complementary',
      background: complementaryBackground,
      style: { matColor: hex(tone(complementHue, 0.2, 0.9)), outerColor: hex(tone(complementHue, 0.7, 0.56)), innerColor: hex(tone(accentHue, 0.72, 0.62)) },
      text: deepText,
      swatches: [hex(deep), hex(tone(complementHue, 0.2, 0.9)), hex(tone(complementHue, 0.7, 0.56)), hex(accent)],
    },
    {
      id: 'noir',
      name: 'Gallery noir',
      background: noirBackground,
      style: { matColor: hex(tone(hsv.h, 0.06, 0.95)), outerColor: hex(tone(accentHue, 0.78, 0.62)), innerColor: hex(tone(accentHue, 0.7, 0.52)) },
      text: noirText,
      swatches: [hex(noir), hex(tone(hsv.h, 0.06, 0.95)), hex(tone(accentHue, 0.78, 0.62)), hex(accent)],
    },
  ]
}

const FALLBACK: CollagePaletteTheme[] = buildThemes([GOLD, MAT])

/** The five themes for a collage's photos. `urls` must already be resolvable by the browser. */
export async function themesFromPhotos(urls: readonly string[]): Promise<CollagePaletteTheme[]> {
  if (urls.length === 0) return FALLBACK.map((theme) => ({ ...theme, swatches: [...theme.swatches] }))
  const pixels = await samplePhotos(urls)
  return buildThemes(quantize(pixels, 8))
}

/** A readable text colour for a stored theme, useful when applying it to a title badge. */
export function textColorOf(color: string): string {
  const parsed = parseColor(color)
  return parsed ? readableOn(hex(parsed)) : '#1a1a2e'
}
