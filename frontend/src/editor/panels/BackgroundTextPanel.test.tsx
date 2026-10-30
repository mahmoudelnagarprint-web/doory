import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../animation/testing'
import { EditorProvider } from '../EditorProvider'
import type { EditorEngine } from '../engine/editor'
import type { DocObject } from '@/types/document'
import { BackgroundTextPanel } from './BackgroundTextPanel'

let engine: EditorEngine

beforeEach(async () => {
  engine = (await setupEditor()).engine
  // The gradient catalog and the font catalog come from the network; the panels fall back to their built-in lists.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
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
        <BackgroundTextPanel />
      </EditorProvider>,
    )
  })
}

const page = () => engine.state.doc.pages[0]
const objects = (): DocObject[] => page().objects

describe('BackgroundTextPanel', () => {
  it('paints the page background when a gradient card is clicked', async () => {
    const user = userEvent.setup()
    await renderPanel()

    const cards = await screen.findAllByTestId(/^gradient-card-/)
    expect(cards.length).toBeGreaterThan(0)
    await user.click(cards[0])

    const background = page().background
    expect(background.type).toBe('gradient')
    if (background.type !== 'gradient') return
    expect(background.stops.length).toBeGreaterThan(1)
    expect(background.kind).toBe('linear')
  })

  it('paints a solid page background when a color kit is clicked', async () => {
    const user = userEvent.setup()
    await renderPanel()

    await user.click(screen.getByRole('tab', { name: /color kits/i }))
    const cards = await screen.findAllByTestId(/^color-kit-/)
    await user.click(cards[0])

    const background = page().background
    expect(background.type).toBe('solid')
  })

  it('adds a text layer and applies the effect when an effect card is clicked with nothing selected', async () => {
    const user = userEvent.setup()
    await renderPanel()

    await user.click(screen.getByRole('tab', { name: /text effects/i }))
    await user.click(await screen.findByTestId('text-effect-neon-glow'))

    await waitFor(() => expect(objects().some((o) => o.type === 'textbox')).toBe(true))
    const text = objects().find((o) => o.type === 'textbox')
    expect(text?.effects as { glow?: { color: string } } | undefined).toMatchObject({ glow: { color: '#1e293b' } })
  })

  it('adds a text layer in the chosen font when nothing is selected', async () => {
    const user = userEvent.setup()
    await renderPanel()

    await user.click(screen.getByRole('tab', { name: /fonts/i }))
    await user.click(await screen.findByTestId('font-card-Inter'))

    await waitFor(() => expect(objects().some((o) => o.fontFamily === 'Inter')).toBe(true))
  })
})
