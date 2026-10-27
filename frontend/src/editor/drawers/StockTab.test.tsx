import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorServices } from '@/types/adapter'
import { setupEditor } from '../animation/testing'
import { EditorProvider } from '../EditorProvider'
import type { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { StockTab } from './StockTab'

let engine: EditorEngine

beforeEach(async () => {
  engine = (await setupEditor()).engine
})

afterEach(() => {
  cleanup()
  engine.dispose()
  vi.restoreAllMocks()
})

describe('StockTab', { timeout: 20_000 }, () => {
  it('says stock photos are not set up instead of searching when no provider has a key', async () => {
    const search = vi.fn()
    engine.adapter.services.stock = {
      providers: vi.fn(async () => ({ providers: [], all: [], default: '' })),
      search,
      importPhoto: vi.fn(),
    } as unknown as EditorServices['stock']

    await act(async () => {
      render(
        <EditorProvider engine={engine} portalRoot={document.body}>
          <StockTab close={() => undefined} />
        </EditorProvider>,
      )
    })

    expect(await screen.findByText(t.imageDrawer.stockOff)).toBeInTheDocument()
    expect(screen.getByTestId('stock-search')).toBeDisabled()
    expect(search).not.toHaveBeenCalled()
  })

  it('still searches the default provider when an older server has no providers endpoint', async () => {
    const search = vi.fn(async () => ({ configured: true, provider: '', total: 0, next_page: null, results: [] }))
    engine.adapter.services.stock = {
      providers: vi.fn(async () => {
        throw new Error('404')
      }),
      search,
      importPhoto: vi.fn(),
    } as unknown as EditorServices['stock']

    await act(async () => {
      render(
        <EditorProvider engine={engine} portalRoot={document.body}>
          <StockTab close={() => undefined} />
        </EditorProvider>,
      )
    })

    await waitFor(() => expect(search).toHaveBeenCalled())
    expect(screen.queryByText(t.imageDrawer.stockOff)).toBeNull()
    expect(screen.getByTestId('stock-search')).not.toBeDisabled()
  })
})
