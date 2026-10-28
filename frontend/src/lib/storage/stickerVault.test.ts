/**
 * Unit tests for the custom sticker vault (IndexedDB with memory fallback).
 * fake-indexeddb backs the real-IDB path; a second suite exercises the fallback.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { StickerRecord } from './stickerVault'

async function freshVault(): Promise<typeof import('./stickerVault')> {
  vi.resetModules()
  return import('./stickerVault')
}

const STICKER_A = {
  name: 'Balloon',
  category: 'عيد ميلاد',
  dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  width: 1,
  height: 1,
  tags: ['studio'],
}

describe('stickerVault (real IndexedDB)', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds a sticker and returns it with an id and timestamp', async () => {
    const vault = await freshVault()
    const record = await vault.addSticker(STICKER_A)
    expect(record.id).toBeTruthy()
    expect(record.name).toBe('Balloon')
    expect(record.category).toBe('عيد ميلاد')
    expect(record.dataUrl).toBe(STICKER_A.dataUrl)
    expect(record.width).toBe(1)
    expect(record.height).toBe(1)
    expect(typeof record.createdAt).toBe('number')
  })

  it('lists stored stickers', async () => {
    const vault = await freshVault()
    await vault.addSticker(STICKER_A)
    await vault.addSticker({ ...STICKER_A, name: 'Rose', category: 'ورود' })
    const list = await vault.listStickers()
    expect(list).toHaveLength(2)
    const names = list.map((s: StickerRecord) => s.name).sort()
    expect(names).toEqual(['Balloon', 'Rose'])
  })

  it('updates name, category and tags', async () => {
    const vault = await freshVault()
    const added = await vault.addSticker(STICKER_A)
    const updated = await vault.updateSticker(added.id, { name: 'New Name', category: 'رمضان', tags: ['neural'] })
    expect(updated).not.toBeNull()
    expect(updated?.name).toBe('New Name')
    expect(updated?.category).toBe('رمضان')
    expect(updated?.tags).toEqual(['neural'])
    const list = await vault.listStickers()
    expect(list[0]?.name).toBe('New Name')
  })

  it('updateSticker returns nothing for an unknown id', async () => {
    const vault = await freshVault()
    expect(await vault.updateSticker('does-not-exist', { name: 'x' })).toBeFalsy()
  })

  it('deletes a sticker', async () => {
    const vault = await freshVault()
    const added = await vault.addSticker(STICKER_A)
    await vault.deleteSticker(added.id)
    expect(await vault.listStickers()).toHaveLength(0)
  })

  it('derives sorted distinct categories', async () => {
    const vault = await freshVault()
    await vault.addSticker(STICKER_A) // عيد ميلاد
    await vault.addSticker({ ...STICKER_A, category: 'ورود' })
    await vault.addSticker({ ...STICKER_A, category: 'رمضان' })
    await vault.addSticker({ ...STICKER_A, category: 'ورود' })
    const categories = await vault.listCategories()
    expect(categories).toHaveLength(3)
    expect(new Set(categories)).toEqual(new Set(['رمضان', 'ورود', 'عيد ميلاد']))
  })

  it('exports and re-imports the vault without duplicates', async () => {
    const vault = await freshVault()
    await vault.addSticker(STICKER_A)
    await vault.addSticker({ ...STICKER_A, name: 'Logo', category: 'شعارات' })
    const exported = await vault.exportVault()
    expect(exported.version).toBe(1)
    expect(exported.stickers).toHaveLength(2)

    await vault.clearVault()
    expect(await vault.listStickers()).toHaveLength(0)

    const imported = await vault.importVault(exported)
    expect(imported).toBe(2)
    // Re-importing the same payload merges by id — no duplicates appear.
    await vault.importVault(exported)
    const list = await vault.listStickers()
    expect(list).toHaveLength(2)
    expect(list.map((s: StickerRecord) => s.name).sort()).toEqual(['Balloon', 'Logo'])
  })

  it('rejects malformed import payloads', async () => {
    const vault = await freshVault()
    await expect(vault.importVault({ nope: true } as unknown as Parameters<typeof vault.importVault>[0])).rejects.toThrow()
  })
})

describe('stickerVault (memory fallback)', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('still works without IndexedDB', async () => {
    const vault = await freshVault()
    const added = await vault.addSticker(STICKER_A)
    expect((await vault.listStickers())).toHaveLength(1)
    const updated = await vault.updateSticker(added.id, { name: 'Renamed' })
    expect(updated?.name).toBe('Renamed')
    await vault.deleteSticker(added.id)
    expect((await vault.listStickers())).toHaveLength(0)
  })
})
