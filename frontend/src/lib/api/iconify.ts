/**
 * Iconify through its public API. `@iconify/react` renders React components, which Fabric cannot put on
 * the canvas, so the editor asks the API for raw SVG markup instead and inserts it as a vector group.
 *
 * The API needs no key and answers with `Access-Control-Allow-Origin: *`, so the browser can call it
 * directly. A deployment that self-hosts the Iconify API only needs to change `API` here.
 */
import type { IconifyIcon, IconifySearchPage } from '@/types/api'

const API = 'https://api.iconify.design'
const ICON_ID = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/i
const MAX_SVG_BYTES = 256 * 1024
export const ICONIFY_PAGE_SIZE = 32

function label(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** `mdi:heart-outline` → its parts, or null for anything that is not an icon id. */
export function parseIconId(id: string): IconifyIcon | null {
  if (!ICON_ID.test(id)) return null
  const [prefix, name] = id.split(':')
  return { id, prefix, name, label: label(name) }
}

/** The URL an `<img>` preview can use. Height keeps the request small; the inserted SVG is larger. */
export function iconPreviewUrl(id: string, height = 96): string {
  const icon = parseIconId(id)
  return icon ? `${API}/${icon.prefix}/${icon.name}.svg?height=${height}` : ''
}

export interface IconifySearchOptions {
  start?: number
  limit?: number
  /** Restrict the search to these collection prefixes, e.g. colored emoji sets. */
  prefixes?: readonly string[]
  signal?: AbortSignal
}

export async function searchIcons(
  query: string,
  { start = 0, limit = ICONIFY_PAGE_SIZE, prefixes, signal }: IconifySearchOptions = {},
): Promise<IconifySearchPage> {
  const text = query.trim()
  if (!text) return { icons: [], total: 0, nextStart: null }
  const params = new URLSearchParams({ query: text, start: String(start), limit: String(limit) })
  if (prefixes && prefixes.length > 0) params.set('prefixes', prefixes.join(','))
  const res = await fetch(`${API}/search?${params.toString()}`, {
    signal,
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Iconify search failed (${res.status})`)
  const data = (await res.json()) as { icons?: unknown; total?: unknown }
  const ids = Array.isArray(data.icons) ? data.icons.filter((value): value is string => typeof value === 'string') : []
  const icons = ids.map(parseIconId).filter((icon): icon is IconifyIcon => icon !== null)
  const total = typeof data.total === 'number' && data.total > 0 ? data.total : icons.length
  return { icons, total, nextStart: start + limit < total ? start + limit : null }
}

/** The icon as standalone SVG markup, sized for the canvas. */
export async function fetchIconSvg(icon: IconifyIcon, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${API}/${icon.prefix}/${icon.name}.svg?height=512`, {
    signal,
    credentials: 'omit',
    headers: { Accept: 'image/svg+xml' },
  })
  if (!res.ok) throw new Error(`Iconify icon failed (${res.status})`)
  const text = await res.text()
  if (text.length > MAX_SVG_BYTES) throw new Error('Icon too large')
  // The API is trusted, but the markup becomes document objects: refuse scripts and oversized files.
  if (!text.trimStart().startsWith('<svg') || /<script[\s>]/i.test(text)) throw new Error('Not an SVG')
  return text
}
