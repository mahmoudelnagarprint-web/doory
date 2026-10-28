/**
 * Mega Assets Engine — Zero-API-Key massive asset loader.
 * Fetches entire Iconify collections via /collection endpoint (10k+ assets),
 * provides search with 999 limit, categories, infinite scroll pagination,
 * DiceBear generator, and unDraw with live colorizer.
 */
import type { IconifyIcon, IconifySearchPage } from '@/types/api'
import { parseIconId, searchIcons, fetchIconSvg, iconPreviewUrl } from './iconify'

const ICONIFY_API = 'https://api.iconify.design'
const ICONIFY_COLLECTION_PAGE_SIZE = 60
export const MAX_SEARCH_LIMIT = 999

// Sticker/Vector collection prefixes to load fully
export const STICKER_COLLECTION_PREFIXES = [
  'openmoji',
  'fluent-emoji-flat',
  'noto',
  'twemoji',
  'emojione',
  'streamline-emojis',
  'fxemoji',
] as const

export type StickerPrefix = (typeof STICKER_COLLECTION_PREFIXES)[number]

/** The colored emoji sets the Stickers tab searches in; the sets above stay browse-only. */
export const STICKER_SEARCH_PREFIXES = ['noto', 'twemoji', 'fluent-emoji-flat', 'emojione'] as const

// Iconify collection response types
export interface IconifyCollectionCategory {
  label: string
  icons: string[]
  aliases?: Record<string, { parent: string }>
}

export interface IconifyCollectionResponse {
  prefix: string
  total: number
  title: string
  categories: Record<string, IconifyCollectionCategory>
  hidden?: string[]
  aliases?: Record<string, { parent: string }>
}

// Custom curated categories for the Stickers tab (data in the lazy stickerCatalog chunk)
export type { CuratedStickerCategory } from './stickerCatalog'
import type { CuratedStickerCategory } from './stickerCatalog'

// Enhanced IconifyIcon with category info
export interface CategorizedIcon extends IconifyIcon {
  category?: string
}

// Collection cache to avoid re-fetching
const collectionCache = new Map<StickerPrefix, IconifyCollectionResponse>()
const allIconsCache = new Map<StickerPrefix, CategorizedIcon[]>()

/** Fetch full collection metadata from Iconify /collection endpoint */
export async function fetchCollection(prefix: StickerPrefix, signal?: AbortSignal): Promise<IconifyCollectionResponse> {
  if (collectionCache.has(prefix)) return collectionCache.get(prefix)!

  const res = await fetch(`${ICONIFY_API}/collection?prefix=${prefix}`, { signal, credentials: 'omit' })
  if (!res.ok) throw new Error(`Iconify collection ${prefix} failed (${res.status})`)
  const data = (await res.json()) as IconifyCollectionResponse
  collectionCache.set(prefix, data)
  return data
}

/** Get all icons from a collection as a flat categorized array */
export async function getAllCollectionIcons(prefix: StickerPrefix, signal?: AbortSignal): Promise<CategorizedIcon[]> {
  if (allIconsCache.has(prefix)) return allIconsCache.get(prefix)!

  const collection = await fetchCollection(prefix, signal)
  const icons: CategorizedIcon[] = []

  for (const [catKey, cat] of Object.entries(collection.categories)) {
    const categoryLabel = cat.label || catKey
    for (const name of cat.icons) {
      const icon = parseIconId(`${prefix}:${name}`)
      if (icon) {
        icons.push({ ...icon, category: categoryLabel })
      }
    }
    // Also include aliases
    if (cat.aliases) {
      for (const [aliasName, _aliasInfo] of Object.entries(cat.aliases)) {
        const icon = parseIconId(`${prefix}:${aliasName}`)
        if (icon) {
          icons.push({ ...icon, category: categoryLabel })
        }
      }
    }
  }

  allIconsCache.set(prefix, icons)
  return icons
}

/** Merged result cache (curated first, live collections as enrichment). */
let allStickerIconsCache: CategorizedIcon[] | null = null

/** Get all icons across all sticker collections, merged and categorized */
export async function getAllStickerIcons(signal?: AbortSignal): Promise<CategorizedIcon[]> {
  if (allStickerIconsCache) return allStickerIconsCache

  // Curated ids come first: deterministic and available offline (tests, slow networks).
  const curated: CategorizedIcon[] = []
  const seen = new Set<string>()
  for (const cat of await loadCuratedCategories()) {
    for (const id of cat.iconIds) {
      if (seen.has(id)) continue
      seen.add(id)
      const icon = parseIconId(id)
      if (icon) curated.push({ ...icon, category: cat.label })
    }
  }

  // Enrich with whatever the live collections return beyond the curated lists.
  const extras: CategorizedIcon[] = []
  for (const prefix of STICKER_COLLECTION_PREFIXES) {
    try {
      for (const icon of await getAllCollectionIcons(prefix, signal)) {
        if (!seen.has(icon.id)) {
          seen.add(icon.id)
          extras.push(icon)
        }
      }
    } catch (e) {
      console.warn(`Failed to load collection ${prefix}:`, e)
    }
  }

  allStickerIconsCache = [...curated, ...extras]
  return allStickerIconsCache
}

/** Search across all sticker collections with 999 limit */
export async function searchStickers(
  query: string,
  { start = 0, limit = MAX_SEARCH_LIMIT, signal }: { start?: number; limit?: number; signal?: AbortSignal } = {}
): Promise<IconifySearchPage> {
  return searchIcons(query, { start, limit, prefixes: STICKER_SEARCH_PREFIXES, signal })
}

/** Curated categories for the Stickers tab — the large literal lives in a lazy chunk. */
let catalogPromise: Promise<CuratedStickerCategory[]> | null = null
export function loadCuratedCategories(): Promise<CuratedStickerCategory[]> {
  if (!catalogPromise) catalogPromise = import('./stickerCatalog').then((m) => m.CURATED_STICKER_CATEGORIES)
  return catalogPromise
}

/** Verified sticker slugs that work instantly as static fallback (no network needed).
 *  These are verified against Iconify collections: noto, twemoji, fluent-emoji-flat, emojione. */
export const DEFAULT_STICKERS: CategorizedIcon[] = [
  // Celebrations (verified slugs)
  'noto:party-popper','noto:confetti-ball','noto:balloon','noto:sparkles','noto:wrapped-gift',
  'noto:sparkler','noto:fireworks','noto:mirror-ball','noto:pinata','noto:red-envelope',
  'twemoji:party-popper','twemoji:confetti-ball','twemoji:balloon','twemoji:sparkles',
  'fluent-emoji-flat:party-popper','fluent-emoji-flat:balloon','fluent-emoji-flat:sparkles',
  'emojione:party-popper','emojione:confetti-ball','emojione:sparkles',
  // Faces & Emotions
  'noto:grinning-face','noto:face-with-tears-of-joy','noto:smiling-face-with-heart-eyes',
  'noto:star-struck','noto:smiling-face-with-sunglasses','noto:zany-face',
  'noto:rolling-on-the-floor-laughing','noto:partying-face','noto:smiling-face-with-halo',
  'noto:nerd-face','noto:face-blowing-a-kiss','noto:winking-face','noto:smirking-face',
  'noto:upside-down-face','noto:face-savoring-food','noto:beaming-face-with-smiling-eyes',
  'noto:hugging-face','twemoji:grinning-face','twemoji:smiling-face-with-heart-eyes',
  'fluent-emoji-flat:grinning-face','fluent-emoji-flat:smiling-face-with-heart-eyes',
  'emojione:grinning-face','emojione:smiling-face-with-heart-eyes',
  // Hearts & Symbols
  'noto:heart-suit','noto:sparkling-heart','noto:growing-heart','noto:two-hearts',
  'noto:high-voltage','noto:hundred-points','noto:rainbow','noto:fire','noto:collision',
  'twemoji:heart','twemoji:sparkling-heart','twemoji:fire','twemoji:rainbow',
  'fluent-emoji-flat:red-heart','fluent-emoji-flat:sparkling-heart','fluent-emoji-flat:fire',
  'fluent-emoji-flat:rainbow','emojione:red-heart','emojione:sparkling-heart',
  'emojione:fire','emojione:rainbow',
  // Animals & Nature
  'noto:dog-face','noto:cat-face','noto:monkey-face','noto:lion','noto:tiger-face',
  'noto:panda','noto:unicorn','noto:dolphin','noto:butterfly','noto:honeybee',
  'noto:penguin','noto:koala','noto:fox','noto:peacock','noto:rabbit-face',
  'noto:pig-face','noto:cow-face','noto:horse-face','noto:frog','noto:owl',
  'twemoji:dog-face','twemoji:cat-face','fluent-emoji-flat:dog-face',
  'emojione:dog-face','emojione:cat-face',
  // Food & Drink
  'noto:pizza','noto:hamburger','noto:french-fries','noto:ice-cream','noto:birthday-cake',
  'noto:cupcake','noto:doughnut','noto:cookie','noto:hot-beverage','noto:strawberry',
  'noto:watermelon','noto:sushi','noto:taco','noto:ramen','noto:croissant',
  'twemoji:pizza','twemoji:hamburger','twemoji:ice-cream','twemoji:birthday-cake',
  'fluent-emoji-flat:pizza','fluent-emoji-flat:hamburger','fluent-emoji-flat:ice-cream',
  'emojione:pizza','emojione:hamburger','emojione:ice-cream',
  // Nature & Weather
  'noto:sun','noto:sun-with-face','noto:full-moon','noto:cloud','noto:snowflake',
  'noto:sunflower','noto:rose','noto:cherry-blossom','noto:four-leaf-clover',
  'noto:seedling','noto:palm-tree','noto:maple-leaf','noto:rainbow','noto:hibiscus',
  'twemoji:sun','twemoji:full-moon','twemoji:cloud','twemoji:snowflake',
  'fluent-emoji-flat:sun','fluent-emoji-flat:full-moon','fluent-emoji-flat:cloud',
  'emojione:sun','emojione:full-moon','emojione:cloud',
  // Objects & Tech
  'noto:camera-with-flash','noto:video-camera','noto:musical-note','noto:guitar',
  'noto:microphone','noto:headphone','noto:rocket','noto:airplane','noto:trophy',
  'noto:1st-place-medal','noto:graduation-cap','noto:crown','noto:gem-stone',
  'noto:magic-wand','noto:crystal-ball','noto:artist-palette','noto:telephone-receiver',
  'noto:e-mail','noto:mobile-phone','noto:laptop','noto:desktop-computer',
  'twemoji:camera','twemoji:rocket','twemoji:mobile-phone',
  'fluent-emoji-flat:camera','fluent-emoji-flat:rocket','fluent-emoji-flat:laptop',
  'emojione:camera','emojione:rocket','emojione:laptop',
  // Arrows & Badges
  'noto:right-arrow','noto:left-arrow','noto:up-arrow','noto:down-arrow',
  'noto:up-right-arrow','noto:down-right-arrow','noto:curved-arrow',
  'noto:double-curly-loop','noto:double-exclamation','noto:exclamation',
  'noto:question','noto:white-check-mark','noto:check-mark-button',
  'twemoji:right-arrow','twemoji:left-arrow','fluent-emoji-flat:arrow-right',
  'emojione:arrow-right','emojione:check-mark',
  // Business & E-commerce
  'noto:briefcase','noto:chart-increasing','noto:chart-decreasing','noto:bar-chart',
  'noto:clipboard','noto:file-folder','noto:open-file-folder','noto:card-index',
  'noto:credit-card','noto:receipt','noto:money-bag','noto:coin','noto:banknote',
  'noto:shopping-cart','noto:shopping-bags','noto:package','noto:label',
  'twemoji:briefcase','twemoji:chart-increasing','fluent-emoji-flat:briefcase',
  'emojione:briefcase','emojione:chart-increasing',
]
  .map(parseIconId)
  .filter((i): i is CategorizedIcon => i !== null)

/** DiceBear styles for generated stickers */
export const DICEBEAR_STYLES = [
  { id: 'fun-emoji', label: 'Fun Emoji', preview: '😀' },
  { id: 'adventurer', label: 'Adventurer', preview: '🏕️' },
  { id: 'bottts', label: 'Bots', preview: '🤖' },
  { id: 'lorelei', label: 'Lorelei', preview: '🧜' },
  { id: 'notionists', label: 'Notionists', preview: '📝' },
  { id: 'shapes', label: 'Shapes', preview: '🔷' },
  { id: 'thumbs', label: 'Thumbs', preview: '👍' },
  { id: 'icons', label: 'Icons', preview: '⭐' },
] as const

export type DiceBearStyle = (typeof DICEBEAR_STYLES)[number]['id']

/** Generate a DiceBear SVG URL */
export function getDiceBearUrl(style: DiceBearStyle, seed: string, options?: Record<string, string>): string {
  const params = new URLSearchParams()
  if (options) {
    for (const [k, v] of Object.entries(options)) params.set(k, v)
  }
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&${params.toString()}`
}

/** Fetch DiceBear SVG markup */
export async function fetchDiceBearSvg(style: DiceBearStyle, seed: string, options?: Record<string, string>, signal?: AbortSignal): Promise<string> {
  const url = getDiceBearUrl(style, seed, options)
  const res = await fetch(url, { signal, credentials: 'omit', headers: { Accept: 'image/svg+xml' } })
  if (!res.ok) throw new Error(`DiceBear ${style} failed (${res.status})`)
  const text = await res.text()
  if (!text.trimStart().startsWith('<svg') || /<script[\s>]/i.test(text)) throw new Error('Not an SVG')
  return text
}

/** unDraw colorizer: replace the primary #6c63ff (or similar) with a custom color */
export function colorizeUndrawSvg(svg: string, primaryColor: string): string {
  // unDraw illustrations typically use #6c63ff as the primary accent color
  // Also handle variations and the CSS variable approach
  return svg
    .replace(/#6c63ff/gi, primaryColor)
    .replace(/#6C63FF/gi, primaryColor)
    .replace(/rgb\(108,\s*99,\s*255\)/gi, hexToRgb(primaryColor))
    .replace(/var\(--primary-color[^)]*\)/gi, primaryColor)
}

/** Helper: hex to rgb string */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgb(${r}, ${g}, ${b})`
}

/** Pagination helper for infinite scroll */
export interface AssetPage<T> {
  items: T[]
  nextStart: number | null
  total: number
}

/** Get a page of icons from all collections combined (for infinite scroll) */
export async function getStickerPage(
  start: number,
  limit: number = ICONIFY_COLLECTION_PAGE_SIZE,
  signal?: AbortSignal
): Promise<AssetPage<CategorizedIcon>> {
  const allIcons = await getAllStickerIcons(signal)
  const items = allIcons.slice(start, start + limit)
  return {
    items,
    nextStart: start + limit < allIcons.length ? start + limit : null,
    total: allIcons.length,
  }
}

/** Get a page from a specific curated category */
export async function getCuratedCategoryPage(
  categoryId: string,
  start: number,
  limit: number = ICONIFY_COLLECTION_PAGE_SIZE,
  signal?: AbortSignal
): Promise<AssetPage<CategorizedIcon>> {
  if (categoryId === 'all') return getStickerPage(start, limit, signal)

  const cat = (await loadCuratedCategories()).find(c => c.id === categoryId)
  if (!cat) return { items: [], nextStart: null, total: 0 }

  // Use static fallback first for instant load, then try to validate with actual icons
  const staticItems = DEFAULT_STICKERS.filter(icon => {
    const catIds = cat.iconIds.map(id => id.split(':')[1])
    return catIds.some(catId => icon.name.includes(catId))
  })

  // If static fallback has enough items, use it immediately (instant load)
  // Otherwise try to fetch from Iconify as fallback
  if (staticItems.length >= Math.min(limit, 20)) {
    const items = staticItems.slice(start, start + limit)
    return {
      items,
      nextStart: start + limit < staticItems.length ? start + limit : null,
      total: staticItems.length,
    }
  }

  // Fallback: try to fetch from curated iconIds (may fail if slugs don't exist)
  try {
    const iconIds = cat.iconIds
    const items: CategorizedIcon[] = []

    for (const id of iconIds.slice(start, start + limit)) {
      const icon = parseIconId(id)
      if (icon) items.push(icon)
    }

    return {
      items,
      nextStart: start + limit < iconIds.length ? start + limit : null,
      total: iconIds.length,
    }
  } catch {
    // Ultimate fallback to static items
    const items = staticItems.slice(start, start + limit)
    return {
      items,
      nextStart: start + limit < staticItems.length ? start + limit : null,
      total: staticItems.length,
    }
  }
}

// Re-export from iconify for convenience
export { parseIconId, searchIcons, fetchIconSvg, iconPreviewUrl, type IconifyIcon }
export type { IconifySearchPage }