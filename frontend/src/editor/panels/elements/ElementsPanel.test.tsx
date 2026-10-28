import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../../animation/testing'
import { EditorProvider } from '../../EditorProvider'
import type { EditorEngine } from '../../engine/editor'
import { ElementsPanel } from './ElementsPanel'

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
        <ElementsPanel />
      </EditorProvider>,
    )
  })
}

describe('ElementsPanel', () => {
  it('keeps unDraw on the illustrations tab only', async () => {
    const user = userEvent.setup()
    await renderPanel()
    await user.click(screen.getByTestId('category-pill-illustrations'))
    expect((await screen.findAllByTestId(/^grid-element-/)).length).toBeGreaterThan(0)
  })

  it('no longer hosts the stickers: they moved to their own Stickers tab', async () => {
    await renderPanel()
    expect(screen.queryByTestId('category-pill-stickers')).toBeNull()
    expect(screen.queryByTestId(/^grid-sticker-/)).toBeNull()
  })
})
