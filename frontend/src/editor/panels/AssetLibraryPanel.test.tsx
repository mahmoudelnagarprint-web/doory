import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../animation/testing'
import { EditorProvider } from '../EditorProvider'
import type { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { AssetLibraryPanel } from './AssetLibraryPanel'

const LOCAL_ASSETS = {
  enabled: true,
  url: '/assets/premium_stickers/',
  count: 2,
  total: 2,
  truncated: false,
  assets: [
    { name: 'Smiley', path: 'stickers/smiley.svg', url: '/assets/premium_stickers/stickers/smiley.svg', type: 'svg', size: 10 },
    { name: 'Photo', path: 'photos/photo.png', url: '/assets/premium_stickers/photos/photo.png', type: 'image', size: 20 },
  ],
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><circle cx="64" cy="64" r="60"/></svg>'

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function answer(input: RequestInfo | URL): Response {
  const url = String(input)
  if (url.includes('/api/v1/local-assets/')) return json(LOCAL_ASSETS)
  if (url.includes('api.iconify.design/search')) return json({ icons: ['mdi:heart'], total: 1, start: 0, limit: 32 })
  if (url.includes('api.iconify.design/mdi/heart.svg')) return new Response(SVG, { status: 200 })
  if (url.startsWith('/assets/premium_stickers/')) return new Response(SVG, { status: 200 })
  return new Response('', { status: 404 })
}

let engine: EditorEngine

beforeEach(async () => {
  engine = (await setupEditor()).engine
  vi.stubGlobal('fetch', vi.fn(answer))
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
        <AssetLibraryPanel close={() => undefined} />
      </EditorProvider>,
    )
  })
}

describe('AssetLibraryPanel', () => {
  it('explains that stock photos need an account, and keeps the other tabs open', async () => {
    await renderPanel()

    expect(screen.getByText(t.assetLibrary.photosOff)).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('tab', { name: t.assetLibrary.mine }))
    expect(await screen.findByTestId('local-assets-grid')).toBeTruthy()
  })

  it('inserts a local SVG as a vector and a local PNG as an image', async () => {
    const user = userEvent.setup()
    const vector = vi.spyOn(engine.insert, 'svgElement').mockResolvedValue()
    const raster = vi.spyOn(engine.insert, 'imageFromAsset').mockResolvedValue()
    await renderPanel()

    await user.click(screen.getByRole('tab', { name: t.assetLibrary.mine }))
    const smiley = await screen.findByRole('button', { name: t.assetLibrary.localAdd('Smiley') })
    await user.click(smiley)
    await waitFor(() => expect(vector).toHaveBeenCalledWith(SVG, 'local:stickers/smiley.svg', 'Smiley'))

    await user.click(screen.getByRole('button', { name: t.assetLibrary.localAdd('Photo') }))
    await waitFor(() =>
      expect(raster).toHaveBeenCalledWith(expect.objectContaining({ url: '/assets/premium_stickers/photos/photo.png', name: 'Photo', kind: 'image' })),
    )
  })

  it('searches Iconify and inserts the chosen icon as an SVG', async () => {
    const user = userEvent.setup()
    const vector = vi.spyOn(engine.insert, 'svgElement').mockResolvedValue()
    await renderPanel()

    await user.click(screen.getByRole('tab', { name: t.assetLibrary.icons }))
    await user.type(screen.getByPlaceholderText(t.assetLibrary.iconSearch), 'heart')
    const cell = await screen.findByTestId('iconify-cell', {}, { timeout: 4000 })
    expect(cell.getAttribute('title')).toBe('mdi:heart')

    await user.click(cell)
    await waitFor(() => expect(vector).toHaveBeenCalledWith(SVG, 'iconify:mdi:heart', 'Heart'))
  })
})
