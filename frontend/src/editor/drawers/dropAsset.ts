import type { AssetRef } from '@/types/adapter'
import type { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import type { AssetDragPayload } from './assetDrag'

/**
 * Places a payload dropped on the canvas. A stock photo is imported first (the server keeps the
 * provider key and stores a copy); a local SVG is fetched as markup so it stays a vector.
 *
 * Loaded only when something is dropped, so the editor's initial bundle stays small.
 */
export async function insertDraggedAsset(
  editor: EditorEngine,
  payload: AssetDragPayload,
  at?: { x: number; y: number },
  pageId?: string,
): Promise<void> {
  try {
    if (payload.kind === 'stock') {
      const stock = editor.adapter.services.stock
      if (!stock) throw new Error('Stock photos are not available here')
      const ref = await stock.importPhoto({ provider: payload.provider, id: payload.id })
      await editor.insert.imageFromAsset(ref, at, pageId)
      return
    }
    if (payload.kind === 'iconify') {
      const { fetchIconSvg, parseIconId } = await import('@/lib/api/iconify')
      const icon = parseIconId(payload.id)
      if (!icon) throw new Error('Invalid icon id')
      const svg = await fetchIconSvg(icon)
      await editor.insert.svgElement(svg, `iconify:${icon.id}`, payload.name, at, pageId)
      return
    }
    if (payload.kind === 'frame') {
      await editor.insert.placeholder(payload.mask, at, pageId)
      return
    }
    if (payload.type === 'svg') {
      const res = await fetch(payload.url, { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!text.trimStart().startsWith('<svg')) throw new Error('Not an SVG')
      await editor.insert.svgElement(text, `local:${payload.url}`, payload.name, at, pageId)
      return
    }
    const ref: AssetRef = {
      id: `local:${payload.url}`,
      url: payload.url,
      thumbUrl: payload.url,
      width: 0,
      height: 0,
      name: payload.name,
      kind: 'image',
    }
    await editor.insert.imageFromAsset(ref, at, pageId)
  } catch {
    editor.toast(t.assetLibrary.insertFailed, 'error')
  }
}
