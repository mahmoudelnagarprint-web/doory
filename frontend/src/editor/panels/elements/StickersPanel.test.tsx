import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../../animation/testing'
import { EditorProvider } from '../../EditorProvider'
import type { EditorEngine } from '../../engine/editor'
import { StickersPanel } from './StickersPanel'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="250" fill="#ff0"/></svg>'

const searchCalls: string[] = []

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function answer(input: RequestInfo | URL): Response {
  const url = String(input)
  if (url.includes('api.iconify.design/search')) {
    searchCalls.push(url)
    return json({ icons: ['noto:cat-face', 'twemoji:cat'], total: 2, start: 0, limit: 36 })
  }
  if (url.includes('api.iconify.design/')) return new Response(SVG, { status: 200 })
  return new Response('', { status: 404 })
}

let engine: EditorEngine

beforeEach(async () => {
  engine = (await setupEditor()).engine
  searchCalls.length = 0
  vi.stubGlobal('fetch', vi.fn(answer))
  // jsdom ships no ResizeObserver / IntersectionObserver; the panel guards for
  // that, but keep no-op stand-ins so both effects behave.
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
})

afterEach(() => {
  cleanup()
  engine.dispose()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function renderPanel(): Promise<void> {
  await act(async () => {
    render(
      <EditorProvider engine={engine} portalRoot={document.body}>
        <StickersPanel />
      </EditorProvider>,
    )
  })
}

describe('StickersPanel', () => {
  it('shows the curated colored stickers without a search request', async () => {
    await renderPanel()

    const cells = await screen.findAllByTestId(/^grid-sticker-/)
    expect(cells.length).toBeGreaterThanOrEqual(50)
    expect(cells.length).toBeLessThanOrEqual(100)
    expect(searchCalls).toEqual([])
  })

  it('searches only the colored emoji sets', async () => {
    const user = userEvent.setup()
    await renderPanel()
    await user.type(screen.getByTestId('elements-search-input'), 'cat')

    await waitFor(
      () => expect(screen.getAllByTestId(/^grid-sticker-/)).toHaveLength(2),
      { timeout: 2000 },
    )
    const search = searchCalls.find((url) => url.includes('/search'))
    expect(search).toContain('query=cat')
    expect(search).toContain('prefixes=noto%2Ctwemoji%2Cfluent-emoji-flat%2Cemojione')
  })

  it('inserts a sticker on the canvas as a vector', async () => {
    const insert = vi.spyOn(engine.insert, 'svgElement').mockResolvedValue(undefined)
    await renderPanel()

    await userEvent.click(await screen.findByTestId('grid-sticker-noto:party-popper'))
    expect(insert).toHaveBeenCalledWith(SVG, 'iconify:noto:party-popper', 'Party Popper')
  })
})
