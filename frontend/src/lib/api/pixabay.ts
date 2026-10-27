/**
 * Pixabay API client for graphics and stickers in the Elements tab.
 * Uses image_type=vector,illustration to strictly return transparent graphics and illustrations, not photos.
 */
import { API_BASE } from './client'

export const PIXABAY_API_KEY = '58256192-bed4f63386bee09456305f140'
const PIXABAY_API_URL = 'https://pixabay.com/api/'

export interface PixabayGraphicItem {
  id: string
  previewUrl: string
  url: string
  largeUrl: string
  title: string
  width: number
  height: number
  type: string
}

export interface PixabaySearchPage {
  total: number
  items: PixabayGraphicItem[]
  hasMore: boolean
}

export interface PixabaySearchOptions {
  page?: number
  perPage?: number
  signal?: AbortSignal
  category?: 'graphics' | 'stickers'
}

/**
 * Search Pixabay for transparent graphics and stickers with &image_type=vector,illustration.
 */
export async function searchPixabayGraphics(
  query: string,
  options: PixabaySearchOptions = {},
): Promise<PixabaySearchPage> {
  const page = options.page ?? 1
  const perPage = Math.min(Math.max(options.perPage ?? 30, 3), 100)
  const q = query.trim() || (options.category === 'stickers' ? 'sticker cute' : 'graphic vector')

  // Attempt backend stock endpoint first if available, otherwise direct Pixabay API
  try {
    const params = new URLSearchParams({
      key: PIXABAY_API_KEY,
      q,
      image_type: 'vector,illustration',
      per_page: String(perPage),
      page: String(page),
      safesearch: 'true',
    })

    const res = await fetch(`${PIXABAY_API_URL}?${params.toString()}`, {
      signal: options.signal,
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`Pixabay API error: ${res.status}`)
    }

    const data = (await res.json()) as {
      total?: number
      totalHits?: number
      hits?: Array<{
        id: number
        previewURL?: string
        webformatURL?: string
        largeImageURL?: string
        tags?: string
        imageWidth?: number
        imageHeight?: number
        type?: string
      }>
    }

    const hits = Array.isArray(data.hits) ? data.hits : []
    const items: PixabayGraphicItem[] = hits
      // Strictly filter out any raster photos that might slip through
      .filter((hit) => hit.type !== 'photo')
      .map((hit) => {
        const title = (hit.tags || 'Graphic')
          .split(',')[0]
          ?.trim()
          .replace(/^\w/, (c) => c.toUpperCase()) || 'Graphic'
        return {
          id: String(hit.id),
          previewUrl: hit.previewURL || hit.webformatURL || '',
          url: hit.webformatURL || hit.largeImageURL || hit.previewURL || '',
          largeUrl: hit.largeImageURL || hit.webformatURL || '',
          title,
          width: hit.imageWidth || 640,
          height: hit.imageHeight || 640,
          type: hit.type || 'vector',
        }
      })

    const total = data.totalHits ?? data.total ?? items.length
    return {
      total,
      items,
      hasMore: page * perPage < total,
    }
  } catch (err) {
    // If direct fetch fails (e.g. strict CSP or network), try through Doory stock backend
    try {
      const stockParams = new URLSearchParams({
        provider: 'pixabay',
        q,
        image_type: 'vector,illustration',
        page: String(page),
        per_page: String(perPage),
      })
      const res = await fetch(`${API_BASE}/stock/photos/?${stockParams.toString()}`, {
        signal: options.signal,
        credentials: 'include',
      })
      if (res.ok) {
        const body = (await res.json()) as {
          total?: number
          results?: Array<{
            id: string
            thumb_url: string
            preview_url: string
            author?: string
            width?: number
            height?: number
          }>
        }
        const results = Array.isArray(body.results) ? body.results : []
        const items: PixabayGraphicItem[] = results.map((r) => ({
          id: r.id,
          previewUrl: r.thumb_url,
          url: r.preview_url,
          largeUrl: r.preview_url,
          title: r.author ? `Graphic by ${r.author}` : 'Graphic',
          width: r.width || 640,
          height: r.height || 640,
          type: 'vector',
        }))
        const total = body.total ?? items.length
        return {
          total,
          items,
          hasMore: page * perPage < total,
        }
      }
    } catch {
      // Fall through to throw original error
    }
    throw err
  }
}
