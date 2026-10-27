import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssetRef, EditorServices } from '@/types/adapter'
import { setupEditor } from '../animation/testing'
import type { EditorEngine } from '../engine/editor'
import { insertDraggedAsset } from './dropAsset'

const PHOTO: AssetRef = { id: 'a1', url: '/media/photo.jpg', thumbUrl: '/media/thumb.jpg', width: 800, height: 600, name: 'Photo', kind: 'image' }

let engine: EditorEngine | null = null

afterEach(() => {
  engine?.dispose()
  engine = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('insertDraggedAsset', { timeout: 20_000 }, () => {
  it('imports a stock photo and places it at the drop point', async () => {
    const setup = await setupEditor()
    engine = setup.engine
    const importPhoto = vi.fn(async () => PHOTO)
    ;(engine.adapter.services as { stock: EditorServices['stock'] }).stock = {
      providers: vi.fn(async () => ({ providers: [], all: [], default: '' })),
      search: vi.fn(),
      importPhoto,
    } as unknown as EditorServices['stock']
    const place = vi.spyOn(engine.insert, 'imageFromAsset').mockResolvedValue()

    await insertDraggedAsset(engine, { kind: 'stock', provider: 'pexels', id: 'p1', name: 'Photo by Ada' }, { x: 12, y: 34 }, 'page-2')

    expect(importPhoto).toHaveBeenCalledWith({ provider: 'pexels', id: 'p1' })
    expect(place).toHaveBeenCalledWith(PHOTO, { x: 12, y: 34 }, 'page-2')
  })

  it('places a local PNG as an image', async () => {
    const setup = await setupEditor()
    engine = setup.engine
    const place = vi.spyOn(engine.insert, 'imageFromAsset').mockResolvedValue()

    await insertDraggedAsset(engine, { kind: 'local', url: '/assets/premium_stickers/photo.png', name: 'Photo', type: 'image' })

    expect(place).toHaveBeenCalledWith(expect.objectContaining({ url: '/assets/premium_stickers/photo.png', name: 'Photo', kind: 'image' }), undefined, undefined)
  })

  it('fetches a local SVG so it stays a vector', async () => {
    const setup = await setupEditor()
    engine = setup.engine
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(svg, { status: 200 })))
    const insert = vi.spyOn(engine.insert, 'svgElement').mockResolvedValue()

    await insertDraggedAsset(engine, { kind: 'local', url: '/assets/premium_stickers/star.svg', name: 'Star', type: 'svg' }, { x: 5, y: 6 })

    expect(insert).toHaveBeenCalledWith(svg, 'local:/assets/premium_stickers/star.svg', 'Star', { x: 5, y: 6 })
  })
})
