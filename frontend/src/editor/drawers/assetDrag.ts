import type { MaskShape } from '@/types/document'

/**
 * The drag payload shared by the asset library and the canvas drop target. Kept free of editor code so
 * the payload helpers stay in the initial bundle and the insertion logic can load on first drop.
 */
export const ASSET_DRAG_TYPE = 'application/x-doory-asset'

export type AssetDragPayload =
  | { kind: 'stock'; provider: string; id: string; name: string }
  | { kind: 'local'; url: string; name: string; type: 'svg' | 'image' }
  | { kind: 'iconify'; id: string; name: string }
  | { kind: 'pixabay'; id: string; name: string; url: string; previewUrl: string }
  | { kind: 'frame'; mask: MaskShape; name: string }

function isText(value: unknown, max = 200): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

/** Root-relative (our server) or absolute http(s): never a `javascript:` or protocol-relative URL. */
function isAssetUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false
  return value.startsWith('/') ? !value.startsWith('//') : /^https?:\/\//i.test(value)
}

export function setAssetDrag(dataTransfer: DataTransfer, payload: AssetDragPayload): void {
  dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify(payload))
  dataTransfer.setData('text/plain', payload.name)
  dataTransfer.effectAllowed = 'copy'
}

export function hasAssetDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(ASSET_DRAG_TYPE)
}

export function readAssetDrag(dataTransfer: DataTransfer): AssetDragPayload | null {
  const raw = dataTransfer.getData(ASSET_DRAG_TYPE)
  if (!raw || raw.length > 4000) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (value.kind === 'stock' && isText(value.provider, 40) && isText(value.id, 100) && isText(value.name)) {
      return { kind: 'stock', provider: value.provider, id: value.id, name: value.name }
    }
    if (value.kind === 'local' && isAssetUrl(value.url) && isText(value.name) && (value.type === 'svg' || value.type === 'image')) {
      return { kind: 'local', url: value.url, name: value.name, type: value.type }
    }
    if (value.kind === 'iconify' && isText(value.id, 100) && isText(value.name)) {
      return { kind: 'iconify', id: value.id, name: value.name }
    }
    if (value.kind === 'pixabay' && isText(value.id, 100) && isText(value.name) && isAssetUrl(value.url) && isAssetUrl(value.previewUrl)) {
      return { kind: 'pixabay', id: value.id, name: value.name, url: value.url, previewUrl: value.previewUrl }
    }
    if (value.kind === 'frame' && isText(value.mask, 100) && isText(value.name)) {
      return { kind: 'frame', mask: value.mask as MaskShape, name: value.name }
    }
  } catch {
    // Another app's payload, or a malformed one: treat it as no asset.
  }
  return null
}
