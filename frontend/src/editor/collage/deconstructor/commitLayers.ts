/**
 * Design Decomposer → editor bridge.
 *
 * `commitLayers` turns a finished `PipelineResult` into real, independently editable Fabric objects on one
 * page, in ONE history step, and never destroys the original design: the untouched source image is added as
 * the bottom-most layer (unless the caller opts out) and every extracted layer sits on top of it in z order.
 *
 * The module talks to the editor through `LayerCommitTarget`, a deliberately narrow surface, so the whole
 * commit is unit-testable without a canvas: tests inject a stub target and their own object builder.
 */
import type { FabricObject } from 'fabric'
import { newId } from '@/lib/document'
import { asDory, ensureId } from '../../engine/objects/dory'
import { createImage } from '../../engine/objects/factories'
import type { ExtractedLayer, PipelineResult } from './types'

/** The narrow engine surface the commit needs, so it is testable without a full editor. */
export interface LayerCommitTarget {
  readonly readOnly: boolean
  readonly state: { readonly activePageId: string }
  assets: { resolve(src: string): Promise<string> }
  insert: { add(objects: FabricObject[], label: string, opts?: { pageId?: string; select?: readonly FabricObject[]; commit?: boolean }): Promise<void> }
  pageSizeOf(pageId: string): { width: number; height: number }
  toast?(message: string, tone?: 'info' | 'error'): void
}

/** A page size in px. */
export interface PageSize {
  width: number
  height: number
}

/**
 * Builds the Fabric object for one extracted layer. Injected by tests (and by any caller that wants a
 * different object), and defaulted to a real `createImage` layer.
 */
export type LayerObjectFactory = (layer: ExtractedLayer, page: PageSize) => Promise<FabricObject>

/** Builds the bottom "original" object. Separate seam so tests need no image decoding at all. */
export type OriginalObjectFactory = (result: PipelineResult, page: PageSize) => Promise<FabricObject>

export interface CommitLayersOptions {
  pageId?: string
  /** Also place the untouched source image as the bottom-most layer. Default true. */
  includeOriginal?: boolean
  /** Remove the previous set of layers committed from the same run before adding. Default false. */
  replacePrevious?: boolean
  /** Seam for the layer builder; defaults to `createLayerObject` (a real Fabric image). */
  objectFactory?: LayerObjectFactory
  /** Seam for the original layer builder; defaults to `createOriginalObject`. */
  originalObjectFactory?: OriginalObjectFactory
}

export interface CommitLayersResult {
  added: number
  pageId: string
  /** Ids of the objects actually added, back-to-front. */
  objectIds: string[]
}

/** History label for the whole decomposition: one undo step takes every committed layer back off the page. */
export const COMMIT_HISTORY_LABEL = 'Add deconstructed layers'

/** Name of the bottom layer that keeps the untouched template, so the user can always compare or restore. */
export const ORIGINAL_LAYER_NAME = 'الأصل'

/**
 * The last set of objects committed per run (keyed by the pipeline input URL), so `replacePrevious` can take
 * exactly those objects back before adding the new set. One entry per run — bounded, and never used to delete
 * anything the user added themselves.
 */
const committedByRun = new Map<string, FabricObject[]>()

function runKeyOf(result: PipelineResult): string {
  return result.input.imageUrl
}

/**
 * Converts a layer's top-left based `page` rectangle into Fabric's centre conventions.
 *
 * Convention: `layer.page` is the top-left corner of the layer in page px. Fabric objects built by
 * `createImage` use `originX/originY: 'center'`, so `left`/`top` are the CENTRE of that rectangle:
 * `left = page.x + page.width / 2`, `top = page.y + page.height / 2`. A Fabric object placed like this
 * rasterises back to exactly `{ page.x, page.y, page.width, page.height }`.
 *
 * `page` is the size of the target page; it is the fallback box for a degenerate (missing or zero sized)
 * rectangle, which keeps a zero-sized Fabric object from being created.
 */
export function layerToPlacement(
  layer: ExtractedLayer,
  page: PageSize,
): { left: number; top: number; width: number; height: number; angle: number } {
  const rect = layer.page
  const x = Number.isFinite(rect.x) ? rect.x : 0
  const y = Number.isFinite(rect.y) ? rect.y : 0
  const width = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : page.width
  const height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : page.height
  return {
    left: x + width / 2,
    top: y + height / 2,
    width,
    height,
    angle: Number.isFinite(layer.rotation) ? layer.rotation : 0,
  }
}

/**
 * Where the FULL-CANVAS layer image goes.
 *
 * `fullCanvasDataUrl` holds the element inside the whole source raster (transparent everywhere else), so it
 * must be laid over the whole page, never squeezed into the layer's own small box. The page mapping is taken
 * from the frozen contract itself: `layer.bounds` covers `layer.page`, so `page.width / bounds.width` is page
 * px per image px. The object's centre is then shifted so the element's `bounds` centre lands exactly on its
 * `page` centre, which reproduces the original composite pixel for pixel.
 *
 * `bounds` and the full-canvas image share one pixel space — the raster the pipeline analysed — so the image's
 * natural size is never compared against `layer.source`, which holds the size of the original FILE (it can be
 * larger when the decoder reduced the image for analysis).
 */
export function layerCanvasPlacement(
  layer: ExtractedLayer,
  page: PageSize,
  natural: { width: number; height: number },
): { left: number; top: number; scale: number; angle: number } {
  const placement = layerToPlacement(layer, page)
  const naturalW = Math.max(1, natural.width)
  const naturalH = Math.max(1, natural.height)
  const boundsW = layer.bounds.width
  const boundsH = layer.bounds.height

  if (!(boundsW > 0) || !(boundsH > 0)) {
    // No usable source rectangle: cover the page with the whole canvas and keep the layer's own box centre.
    const scale = Math.min(page.width / naturalW, page.height / naturalH)
    return { left: placement.left, top: placement.top, scale, angle: placement.angle }
  }

  // Page px per image px. The pipeline maps source → page uniformly, so width and height agree.
  const scale = placement.width / boundsW
  const dx = (naturalW / 2 - (layer.bounds.x + boundsW / 2)) * scale
  const dy = (naturalH / 2 - (layer.bounds.y + boundsH / 2)) * scale

  return { left: placement.left + dx, top: placement.top + dy, scale, angle: placement.angle }
}

/** Opacity clamped to Fabric's 0..1, defaulting to opaque when the pipeline value is unusable. */
function opacityOf(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1
}

/** The real default layer object: a Fabric image of `layer.fullCanvasDataUrl`, aligned on the page. */
async function createLayerObject(
  target: LayerCommitTarget,
  layer: ExtractedLayer,
  page: PageSize,
): Promise<FabricObject> {
  const src = layer.fullCanvasDataUrl || layer.croppedDataUrl
  if (!src) throw new Error('الطبقة لا تحتوي على بيانات صورة.')
  const url = await target.assets.resolve(src)
  const img = await createImage({ src, url }, { x: page.width / 2, y: page.height / 2 }, page)
  const placement = layerCanvasPlacement(layer, page, img.getOriginalSize())
  img.set({
    left: placement.left,
    top: placement.top,
    scaleX: placement.scale,
    scaleY: placement.scale,
    angle: placement.angle,
    opacity: opacityOf(layer.opacity),
  })
  img.setCoords()
  const d = asDory(img)
  // A fresh id per commit: the same run can be committed again without colliding in the document.
  d.id = newId()
  d.name = layer.name
  return img
}

/** The real default bottom layer: the untouched source image the pipeline kept, covering the page. */
async function createOriginalObject(
  target: LayerCommitTarget,
  result: PipelineResult,
  page: PageSize,
): Promise<FabricObject> {
  const src = result.originalDataUrl
  if (!src) throw new Error('لا توجد صورة أصلية في نتيجة التفكيك.')
  const url = await target.assets.resolve(src)
  const img = await createImage({ src, url }, { x: page.width / 2, y: page.height / 2 }, page)
  const d = asDory(img)
  d.id = newId()
  d.name = ORIGINAL_LAYER_NAME
  return img
}

/**
 * Puts every extracted layer of `result` on the page, back to front, plus the untouched original underneath.
 *
 * - one `insert.add` call ⇒ one undo/redo step for the whole decomposition;
 * - `readOnly` editors are left untouched (nothing added, nothing announced);
 * - a layer whose image cannot be resolved is skipped and reported, never silently counted as added;
 * - `result` is never mutated.
 */
export async function commitLayers(
  target: LayerCommitTarget,
  result: PipelineResult,
  options: CommitLayersOptions = {},
): Promise<CommitLayersResult> {
  const pageId = options.pageId ?? target.state.activePageId
  if (target.readOnly) return { added: 0, pageId, objectIds: [] }

  const page = target.pageSizeOf(pageId)
  const buildLayer = options.objectFactory ?? ((layer: ExtractedLayer, size: PageSize) => createLayerObject(target, layer, size))
  const buildOriginal = options.originalObjectFactory ?? ((res: PipelineResult, size: PageSize) => createOriginalObject(target, res, size))

  const objects: FabricObject[] = []
  let skipped = 0

  // The original goes in first, so it is the bottom layer and can always be compared against or restored.
  if (options.includeOriginal !== false) {
    try {
      objects.push(await buildOriginal(result, page))
    } catch {
      skipped += 1
    }
  }

  // Back to front. A copy is sorted: `result` itself is never touched.
  const ordered = [...result.layers].sort((a, b) => a.zIndex - b.zIndex)
  for (const layer of ordered) {
    try {
      objects.push(await buildLayer(layer, page))
    } catch {
      skipped += 1
    }
  }

  if (skipped > 0) {
    target.toast?.(`تعذّر تحميل ${skipped} من عناصر التفكيك وتم تخطيها.`, 'error')
  }
  if (objects.length === 0) return { added: 0, pageId, objectIds: [] }

  if (options.replacePrevious) {
    const previous = committedByRun.get(runKeyOf(result))
    let canvas: FabricObject['canvas']
    for (const obj of previous ?? []) {
      if (!obj.canvas) continue
      obj.canvas.remove(obj)
      canvas = obj.canvas
    }
    canvas?.requestRenderAll()
  }

  try {
    // ONE call: the engine records a single history step, so undo takes the whole decomposition back.
    await target.insert.add(objects, COMMIT_HISTORY_LABEL, { pageId })
  } catch {
    target.toast?.('تعذّر إضافة طبقات التفكيك إلى الصفحة.', 'error')
    return { added: 0, pageId, objectIds: [] }
  }

  const objectIds = objects.map((obj) => ensureId(obj))
  committedByRun.set(runKeyOf(result), objects)
  return { added: objects.length, pageId, objectIds }
}
