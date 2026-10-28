import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchIconSvg, iconPreviewUrl, parseIconId, searchIcons } from './iconify'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('parseIconId', () => {
  it('splits a valid id into prefix, name and label', () => {
    expect(parseIconId('mdi:heart-outline')).toEqual({ id: 'mdi:heart-outline', prefix: 'mdi', name: 'heart-outline', label: 'Heart Outline' })
  })

  it('rejects anything that is not an icon id', () => {
    for (const bad of ['', 'mdi', 'mdi:', ':heart', 'mdi:heart/../../x', 'mdi:heart?x=1', 'mdi:heart outline']) {
      expect(parseIconId(bad), bad).toBeNull()
    }
  })

  it('builds preview URLs only for valid ids', () => {
    expect(iconPreviewUrl('mdi:heart')).toBe('https://api.iconify.design/mdi/heart.svg?height=96')
    expect(iconPreviewUrl('not an icon')).toBe('')
  })
})

describe('searchIcons', () => {
  it('asks the API for a page and keeps valid ids', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => json({ icons: ['mdi:heart', 'tabler:heart-filled', 'bad id'], total: 80, limit: 3, start: 0 }))
    vi.stubGlobal('fetch', fetchMock)

    const page = await searchIcons('heart', { start: 0, limit: 3 })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('https://api.iconify.design/search?')
    expect(url).toContain('query=heart')
    expect(page.icons.map((icon) => icon.id)).toEqual(['mdi:heart', 'tabler:heart-filled'])
    expect(page.total).toBe(80)
    expect(page.nextStart).toBe(3)
  })

  it('restricts the search to the given prefixes', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => json({ icons: ['noto:dog-face'], total: 1, limit: 3, start: 0 }))
    vi.stubGlobal('fetch', fetchMock)

    const page = await searchIcons('dog', { limit: 3, prefixes: ['noto', 'twemoji'] })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('prefixes=noto%2Ctwemoji')
    expect(page.icons.map((icon) => icon.id)).toEqual(['noto:dog-face'])
  })

  it('does not call the API for an empty search', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await searchIcons('   ')).toEqual({ icons: [], total: 0, nextStart: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes a failed request on as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    await expect(searchIcons('heart')).rejects.toThrow('503')
  })
})

describe('fetchIconSvg', () => {
  const icon = parseIconId('mdi:heart')!

  it('returns the SVG markup', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><path d="M0 0"/></svg>'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(svg, { status: 200 })))

    expect(await fetchIconSvg(icon)).toBe(svg)
  })

  it('refuses markup that is not a safe, plain SVG', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>no</html>', { status: 200 })))
    await expect(fetchIconSvg(icon)).rejects.toThrow('Not an SVG')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg><script>alert(1)</script></svg>', { status: 200 })))
    await expect(fetchIconSvg(icon)).rejects.toThrow('Not an SVG')
  })
})
