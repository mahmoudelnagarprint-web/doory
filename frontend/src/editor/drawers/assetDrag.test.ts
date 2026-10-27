import { describe, expect, it } from 'vitest'
import { ASSET_DRAG_TYPE, hasAssetDrag, readAssetDrag, setAssetDrag } from './assetDrag'

function transfer(): DataTransfer {
  const data = new Map<string, string>()
  return {
    get types() {
      return [...data.keys()]
    },
    setData: (type: string, value: string) => {
      data.set(type, value)
    },
    getData: (type: string) => data.get(type) ?? '',
    effectAllowed: 'uninitialized',
  } as unknown as DataTransfer
}

describe('asset drag payloads', () => {
  it('round-trips a stock photo and a local asset', () => {
    const dt = transfer()
    setAssetDrag(dt, { kind: 'stock', provider: 'unsplash', id: 'abc', name: 'Photo by Ada on Unsplash' })

    expect(hasAssetDrag(dt)).toBe(true)
    expect(readAssetDrag(dt)).toEqual({ kind: 'stock', provider: 'unsplash', id: 'abc', name: 'Photo by Ada on Unsplash' })
    expect(dt.getData('text/plain')).toBe('Photo by Ada on Unsplash')

    setAssetDrag(dt, { kind: 'local', url: '/assets/premium_stickers/star.svg', name: 'Star', type: 'svg' })
    expect(readAssetDrag(dt)).toEqual({ kind: 'local', url: '/assets/premium_stickers/star.svg', name: 'Star', type: 'svg' })
  })

  it('ignores other draggers and malformed payloads', () => {
    const dt = transfer()
    expect(readAssetDrag(dt)).toBeNull()
    dt.setData(ASSET_DRAG_TYPE, '{not json')
    expect(readAssetDrag(dt)).toBeNull()
    dt.setData(ASSET_DRAG_TYPE, JSON.stringify({ kind: 'local', url: 'javascript:alert(1)', name: 'x', type: 'image' }))
    expect(readAssetDrag(dt)).toBeNull()
    dt.setData(ASSET_DRAG_TYPE, JSON.stringify({ kind: 'local', url: '//evil.example/x.svg', name: 'x', type: 'svg' }))
    expect(readAssetDrag(dt)).toBeNull()
    dt.setData(ASSET_DRAG_TYPE, JSON.stringify({ kind: 'wat', id: '1' }))
    expect(readAssetDrag(dt)).toBeNull()
  })
})
