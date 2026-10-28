/**
 * Smart Collage Studio engine API.
 *
 * A collage is a set of slots (placeholders or filled pictures) plus two companion objects per slot
 * (a mat behind and a gold inner ring above). All three carry the same `collage` meta, so the layout
 * can be solved again from the document alone. Re-layout keeps every picture in its slot, on every
 * template change; shrinking a collage releases excess photos instead of deleting them.
 */
import { type FabricImage, type FabricObject, type IText, Point, Rect, Shadow } from 'fabric'
import type { AssetRef } from '@/types/adapter'
import type { LocalAsset } from '@/types/api'
import type { CollageBounds, CollageFrameSpec, CollageLayoutId, CollageMeta, CollageStyle, ImageFilterSpec, ImageFilterType, MaskShape, SlotSpec } from '@/types/document'
import { newId } from '@/lib/document'
import type { EditorEngine } from '../editor'
import { asDory } from '../objects/dory'
import { createPlaceholder } from '../objects/factories'
import { applyImageFilters, FILTER_PRESETS, normalizeSpecs, withSpec } from '../objects/filters'
import { applyMask, buildClipPath, DEFAULT_MASK_RADIUS } from '../objects/masks'
import { applySlotClip } from '../objects/masks'
import { clampSlotImage, coverSlotTransform } from '../objects/slot'
import { syncDirection } from '../objects/textStyle'
import { COLLAGE_MAX_SLOTS, defaultCollageGap, defaultCollageMargin, defaultCollageStyle, resolveFrames, resolveLayout, type CollageFrame } from '../collage/layout'
import { collageMetaOf, readCollageMeta } from '../collage/model'

export type CollageFont = 'Cairo' | 'Amiri' | 'Tajawal'
export type CollageTextVariant = 'headline' | 'subhead' | 'body' | 'caption'

export interface CollageCreateOptions {
  template?: CollageLayoutId
  count?: number
  gap?: number
  margin?: number
  rtl?: boolean
  style?: Partial<CollageStyle>
  /** Explicit frames for a curated or generated layout (overrides `template`). */
  frames?: readonly CollageFrameSpec[]
  name?: string
}

interface CollagePatch {
  template?: CollageLayoutId
  frames?: readonly CollageFrameSpec[]
  count?: number
  gap?: number
  margin?: number
  rtl?: boolean
  style?: Partial<CollageStyle>
  bounds?: CollageBounds
  name?: string
}

export interface CollageSticker {
  url: string
  path: string
  name: string
  type: 'svg' | 'image'
}

const MIN_SLOTS = 1
const MAX_SLOTS = COLLAGE_MAX_SLOTS
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

const FONT_CATEGORY: Record<CollageFont, 'serif' | 'sans-serif'> = {
  Cairo: 'sans-serif',
  Amiri: 'serif',
  Tajawal: 'sans-serif',
}

const TEXT_SAMPLE: Record<CollageTextVariant, string> = {
  headline: 'مساحة للكلمة',
  subhead: 'جمال في التفاصيل',
  body: 'اكتب حكايتك هنا…',
  caption: 'تحت الضوء',
}

const TEXT_SIZE: Record<CollageTextVariant, number> = { headline: 44, subhead: 30, body: 20, caption: 14 }
const TEXT_WEIGHT: Record<CollageTextVariant, number> = { headline: 700, subhead: 600, body: 400, caption: 500 }
const TEXT_COLOR: Record<CollageTextVariant, string> = {
  headline: '#f6f0dd',
  subhead: '#d4af37',
  body: '#e7dfcf',
  caption: '#c9bca4',
}

export class CollageApi {
  constructor(private readonly engine: EditorEngine) {}

  private get pageId(): string {
    return this.engine.state.activePageId
  }

  private get view() {
    return this.engine.activeView()
  }

  private frameMask(meta: CollageMeta, frame: CollageFrame): MaskShape | undefined {
    if (frame.mask !== undefined) return frame.mask
    if (meta.layout === 'arch') return 'arch'
    return meta.style.radius > 0 ? 'rounded' : undefined
  }

  private frameRadius(style: CollageStyle, frame: CollageFrame): number | undefined {
    if (frame.radius !== undefined) return clamp(frame.radius, 0, 0.5)
    if (frame.mask !== undefined && frame.mask !== 'rounded') return undefined
    return style.radius > 0 ? this.radiusFraction(style, frame) : undefined
  }

  private radiusFraction(style: CollageStyle, frame: CollageFrame): number {
    return clamp(style.radius / Math.max(1, Math.min(frame.width, frame.height)), 0, 0.5)
  }

  /** Creates a new collage on the active page and returns its id. */
  async create(options: CollageCreateOptions = {}): Promise<string> {
    const page = this.engine.pageSizeOf(this.pageId)
    const specs = options.frames?.slice(0, MAX_SLOTS)
    const count = specs && specs.length > 0 ? specs.length : clamp(Math.round(options.count ?? 4), MIN_SLOTS, MAX_SLOTS)
    const layout: CollageLayoutId = specs && specs.length > 0 ? 'custom' : options.template ?? 'grid'
    const style = { ...defaultCollageStyle(page), ...options.style }
    const margin = options.margin ?? defaultCollageMargin(page)
    const gap = options.gap ?? defaultCollageGap(page)
    const rtl = options.rtl ?? false
    const base: CollageMeta = {
      id: newId(),
      name: options.name ?? 'Smart collage',
      layout,
      ...(specs && specs.length > 0 ? { frames: specs } : {}),
      gap,
      margin,
      rtl,
      index: 0,
      bounds: { x: 0, y: 0, width: page.width, height: page.height },
      style,
    }
    const frames = base.frames ? resolveFrames(base.frames, base.bounds, margin, rtl) : resolveLayout(layout, count, base.bounds, gap, margin, rtl)
    const parts = frames.flatMap((frame, index) => this.buildSlot(base, frame, index))
    const ordered = this.orderParts(parts)
    const firstSlot = ordered.find((object) => !asDory(object).collage?.role)
    await this.engine.insert.add(ordered, 'Add collage', { select: firstSlot ? [firstSlot] : undefined })
    return base.id
  }

  /** Mats go behind every slot, inner rings above them, so overlapping (diagonal) frames stay readable. */
  private orderParts(parts: readonly FabricObject[]): FabricObject[] {
    const rank = (object: FabricObject): number => {
      const role = asDory(object).collage?.role
      return role === 'mat' ? 0 : role === 'inner' ? 2 : 1
    }
    return [...parts].sort((a, b) => rank(a) - rank(b))
  }

  private buildSlot(base: CollageMeta, frame: CollageFrame, index: number): FabricObject[] {
    const meta: CollageMeta = { ...base, index }
    const mask = this.frameMask(base, frame)
    const radius = mask === 'rounded' ? this.frameRadius(base.style, frame) : undefined
    const slot = createPlaceholder({ x: frame.cx, y: frame.cy }, frame.width, frame.height, mask)
    slot.set({
      angle: frame.angle,
      fill: 'rgba(212,175,55,0.07)',
      stroke: 'rgba(212,175,55,0.42)',
      strokeWidth: Math.max(1, base.style.outerWidth / 2),
      strokeDashArray: [6, 4],
    })
    const sd = asDory(slot)
    sd.name = `Slot ${index + 1}`
    sd.collage = meta
    if (radius !== undefined) {
      sd.maskRadius = radius
      const rx = radius * Math.min(frame.width, frame.height)
      slot.set({ rx, ry: rx })
    }
    applyMask(slot)
    return [this.makeFrame(meta, 'mat', frame, base.style), slot, this.makeFrame(meta, 'inner', frame, base.style)]
  }

  private makeFrame(meta: CollageMeta, role: 'mat' | 'inner', frame: CollageFrame, style: CollageStyle): FabricObject {
    const mat = role === 'mat'
    const width = frame.width + (mat ? style.matWidth * 2 : 0)
    const height = frame.height + (mat ? style.matWidth * 2 : 0)
    const mask = this.frameMask(meta, frame)
    const radius = mask === 'rounded' ? this.frameRadius(style, frame) : undefined
    const radiusPx = (radius ?? 0) * Math.min(frame.width, frame.height) + (mat ? style.matWidth : 0)
    const shape = mask
      ? buildClipPath(mask, width, height, clamp(radiusPx / Math.max(1, Math.min(width, height)), 0, 0.5))
      : new Rect({ width, height, rx: radiusPx, ry: radiusPx })
    shape.set({
      left: frame.cx,
      top: frame.cy,
      originX: 'center',
      originY: 'center',
      angle: frame.angle,
      fill: mat ? style.matColor : null,
      stroke: mat ? style.outerColor : style.innerColor,
      strokeWidth: mat ? style.outerWidth : style.innerWidth,
      strokeUniform: true,
      shadow: mat && style.shadow ? new Shadow({ ...style.shadow }) : null,
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      hoverCursor: 'default',
    })
    const d = asDory(shape)
    d.id = newId()
    d.name = mat ? 'Collage mat' : 'Collage inner frame'
    d.collage = { ...meta, role }
    return shape
  }

  private configureFrame(rect: FabricObject): void {
    rect.set({
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      hoverCursor: 'default',
    })
    rect.setCoords()
  }

  /** Re-solves a collage and updates every slot and companion frame in one undoable step. */
  private reflow(id: string, patch: CollagePatch, label: string, coalesceKey: string): void {
    const view = this.view
    if (!view || this.engine.readOnly) return
    const objects = view.canvas.getObjects()
    const slots = objects
      .filter((object) => {
        const meta = collageMetaOf(object)
        return meta?.id === id && !meta.role
      })
      .sort((a, b) => (collageMetaOf(a)?.index ?? 0) - (collageMetaOf(b)?.index ?? 0))
    if (slots.length === 0) return
    const firstMeta = collageMetaOf(slots[0])
    if (!firstMeta) return
    const oldCount = slots.length

    // An explicit layout wins over the template; setting a template clears the explicit frames again.
    let layout: CollageLayoutId
    let specs: CollageFrameSpec[] | undefined
    if (patch.frames !== undefined) {
      specs = patch.frames.slice(0, MAX_SLOTS).filter((spec) => spec.width > 0 && spec.height > 0)
      layout = specs.length > 0 ? 'custom' : patch.template ?? (firstMeta.layout === 'custom' ? 'grid' : firstMeta.layout)
      if (specs.length === 0) specs = undefined
    } else if (patch.template !== undefined) {
      layout = patch.template
      specs = undefined
    } else {
      layout = firstMeta.layout
      specs = firstMeta.frames ? [...firstMeta.frames] : undefined
    }

    const requested = patch.frames !== undefined ? specs?.length ?? oldCount : patch.count ?? (specs ? specs.length : oldCount)
    const count = clamp(Math.round(requested), MIN_SLOTS, MAX_SLOTS)
    // A generated/curated layout keeps its frames when fewer slots are asked for; asking for more
    // slots than the layout has falls back to the built-in grid instead of inventing extra frames.
    if (specs && count < specs.length) specs = specs.slice(0, count)
    else if (specs && count > specs.length) specs = undefined
    if (!specs && layout === 'custom') layout = 'grid'

    const base: CollageMeta = {
      id: firstMeta.id,
      name: patch.name ?? firstMeta.name,
      layout,
      ...(specs && specs.length > 0 ? { frames: specs } : {}),
      gap: clamp(patch.gap ?? firstMeta.gap, 0, 2000),
      margin: clamp(patch.margin ?? firstMeta.margin, 0, 2000),
      rtl: patch.rtl ?? firstMeta.rtl,
      index: 0,
      bounds: patch.bounds ?? firstMeta.bounds,
      style: { ...firstMeta.style, ...patch.style },
    }
    const frames = specs && specs.length > 0
      ? resolveFrames(specs, base.bounds, base.margin, base.rtl)
      : resolveLayout(base.layout, count, base.bounds, base.gap, base.margin, base.rtl)
    const selectedIds = view.selectedIds()

    for (let i = 0; i < Math.min(oldCount, count); i++) {
      const object = slots[i]
      const meta = { ...base, index: i }
      this.applyFrameToSlot(object, frames[i], meta)
      this.ensureFrames(object, meta, frames[i])
    }

    // More slots: new placeholders with their own mat and inner ring, added above the existing stack.
    if (count > oldCount) {
      for (let i = oldCount; i < count; i++) {
        const parts = this.buildSlot(base, frames[i], i)
        for (const part of parts) {
          view.configure(part)
          if (asDory(part).collage?.role) this.configureFrame(part)
          view.canvas.add(part)
        }
      }
    }

    // Fewer slots: empty placeholders go, filled pictures stay as free framed photos (No Photo Left Behind).
    if (count < oldCount) {
      for (let i = count; i < oldCount; i++) {
        const object = slots[i]
        const d = asDory(object)
        if (d.isPlaceholder) view.canvas.remove(object)
        else {
          d.collage = undefined
          d.name = d.name || 'Released photo'
        }
        for (const frame of objects.filter((candidate) => {
          const meta = collageMetaOf(candidate)
          return meta?.id === id && meta.role && meta.index === i
        })) view.canvas.remove(frame)
      }
    }

    this.restack(id)
    const keep = selectedIds
      .map((sid) => view.getById(sid))
      .filter((object): object is FabricObject => !!object)
    const firstSlot = view.canvas.getObjects().find((object) => {
      const meta = collageMetaOf(object)
      return meta?.id === id && !meta.role
    })
    if (keep.length > 0) view.selectObjects(keep)
    else if (firstSlot) view.selectObjects([firstSlot])
    view.canvas.requestRenderAll()
    this.engine.commit(this.pageId, { label, coalesceKey })
  }

  /**
   * Keeps the three layers of a reflowed collage readable: every mat below every slot, every inner ring
   * above them. The parts keep the stretch of z-indices they already occupy, so unrelated objects that
   * happen to sit between them are not pushed around.
   */
  private restack(id: string): void {
    const view = this.view
    if (!view) return
    const objects = view.canvas.getObjects()
    const spots: number[] = []
    const parts: FabricObject[] = []
    objects.forEach((object, index) => {
      if (collageMetaOf(object)?.id === id) {
        spots.push(index)
        parts.push(object)
      }
    })
    if (parts.length < 2) return
    const rank = (object: FabricObject): number => {
      const role = collageMetaOf(object)?.role
      return role === 'mat' ? 0 : role === 'inner' ? 2 : 1
    }
    const sorted = [...parts].sort((a, b) =>
      rank(a) - rank(b) || (collageMetaOf(a)?.index ?? 0) - (collageMetaOf(b)?.index ?? 0))
    for (const part of parts) view.canvas.remove(part)
    sorted.forEach((part, i) => view.canvas.insertAt(spots[i] ?? view.canvas.size(), part))
  }

  private applyFrameToSlot(object: FabricObject, frame: CollageFrame, meta: CollageMeta): void {
    const d = asDory(object)
    const mask = this.frameMask(meta, frame)
    const radius = mask === 'rounded' ? this.frameRadius(meta.style, frame) : undefined
    if (d.isPlaceholder) {
      const rx = radius !== undefined ? radius * Math.min(frame.width, frame.height) : 0
      object.set({
        left: frame.cx,
        top: frame.cy,
        width: frame.width,
        height: frame.height,
        angle: frame.angle,
        scaleX: 1,
        scaleY: 1,
        fill: 'rgba(212,175,55,0.07)',
        stroke: 'rgba(212,175,55,0.42)',
        strokeWidth: Math.max(1, meta.style.outerWidth / 2),
        strokeDashArray: [6, 4],
        rx,
        ry: rx,
      })
      d.maskShape = mask
      d.maskRadius = radius
      d.collage = meta
      applyMask(object)
    } else if (d.slot) {
      const old = d.slot
      const centre = object.getCenterPoint()
      const offX = centre.x - old.cx
      const offY = centre.y - old.cy
      const slot: SlotSpec = {
        cx: frame.cx,
        cy: frame.cy,
        width: frame.width,
        height: frame.height,
        angle: frame.angle,
        ...(mask !== undefined ? { mask } : {}),
        ...(radius !== undefined ? { radius } : {}),
        ...(old.src ? { src: old.src } : {}),
      }
      d.slot = slot
      d.collage = meta
      object.setPositionByOrigin(new Point(frame.cx + offX, frame.cy + offY), 'center', 'center')
      applySlotClip(object)
      clampSlotImage(object)
      object.set('dirty', true)
    } else {
      d.collage = meta
    }
    object.setCoords()
  }

  /**
   * Companions are recreated rather than patched: an arch, circle or hexagon mat is a clip-path object,
   * not a rect, so rebuilding is both simpler and the only way to keep the rings in step with the shape.
   */
  private ensureFrames(slot: FabricObject, meta: CollageMeta, frame: CollageFrame): void {
    const view = this.view
    if (!view) return
    const stale = view.canvas.getObjects().filter((object) => {
      const m = collageMetaOf(object)
      return m?.id === meta.id && m.role && m.index === meta.index
    })
    for (const object of stale) view.canvas.remove(object)
    this.insertFrame(slot, this.makeFrame(meta, 'mat', frame, meta.style), true)
    this.insertFrame(slot, this.makeFrame(meta, 'inner', frame, meta.style), false)
  }

  private insertFrame(slot: FabricObject, frame: FabricObject, behind: boolean): void {
    const view = this.view
    if (!view) return
    view.configure(frame)
    this.configureFrame(frame)
    const index = view.canvas.getObjects().indexOf(slot)
    view.canvas.insertAt(behind ? Math.max(0, index) : Math.min(view.canvas.size(), index + 1), frame)
  }

  setLayout(id: string, template: CollageLayoutId): void {
    this.reflow(id, { template }, 'Change collage layout', 'collage:layout')
  }

  /**
   * Swaps in an explicit layout (a curated preset or one of the procedural generators) without touching
   * the photos: each slot keeps its picture and only the frames move.
   */
  applyFrames(id: string, frames: readonly CollageFrameSpec[], label = 'Change collage layout'): void {
    this.reflow(id, { frames }, label, 'collage:layout')
  }

  setCount(id: string, count: number): void {
    this.reflow(id, { count }, 'Change collage slots', 'collage:count')
  }

  setGap(id: string, gap: number): void {
    this.reflow(id, { gap }, 'Change collage layout', 'collage:gap')
  }

  setMargin(id: string, margin: number): void {
    this.reflow(id, { margin }, 'Change collage layout', 'collage:margin')
  }

  setRtl(id: string, rtl: boolean): void {
    this.reflow(id, { rtl }, 'Change collage layout', 'collage:rtl')
  }

  setStyle(id: string, style: Partial<CollageStyle>): void {
    this.reflow(id, { style }, 'Change collage frame', 'collage:style')
  }

  moveCollage(id: string, dx: number, dy: number): void {
    const view = this.view
    const first = view?.canvas.getObjects().find((object) => {
      const meta = collageMetaOf(object)
      return meta?.id === id && !meta.role
    })
    const meta = first ? collageMetaOf(first) : undefined
    if (!meta) return
    this.reflow(id, { bounds: { ...meta.bounds, x: meta.bounds.x + dx, y: meta.bounds.y + dy } }, 'Move collage', 'collage:move')
  }

  selectSlot(id: string): void {
    this.engine.select([id])
  }

  /**
   * Natural width / height of every slot's picture, in slot order. Empty slots answer 3:2 so
   * "auto-fit to photos" still produces a sensible row rhythm before all photos are in.
   */
  slotAspects(id: string): number[] {
    const view = this.view
    if (!view) return []
    return view.canvas.getObjects()
      .filter((object) => {
        const meta = collageMetaOf(object)
        return meta?.id === id && !meta.role
      })
      .sort((a, b) => (collageMetaOf(a)?.index ?? 0) - (collageMetaOf(b)?.index ?? 0))
      .map((object) => {
        if (object.type !== 'image') return 1.5
        const img = object as FabricImage
        const element = img.getElement() as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | undefined
        const width = element?.naturalWidth || element?.width || img.width || 0
        const height = element?.naturalHeight || element?.height || img.height || 0
        return width > 0 && height > 0 ? width / height : 1.5
      })
  }

  /** Opens the file picker for an empty slot, or replaces the picture of a filled one. */
  async fillSlot(id: string): Promise<void> {
    const view = this.view
    const object = view?.getById(id)
    if (!view || !object) return
    if (asDory(object).isPlaceholder) {
      await this.engine.insert.fillPlaceholder(this.pageId, id)
      return
    }
    view.selectObjects([object])
    await this.engine.insert.pickAndReplaceImage()
  }

  async replaceSlotWithAsset(pageId: string, id: string, ref: AssetRef): Promise<void> {
    const view = this.engine.viewOf(pageId)
    const object = view?.getById(id)
    if (!view || !object) return
    if (asDory(object).isPlaceholder) {
      await this.engine.insert.fillPlaceholderWith(pageId, id, ref)
      return
    }
    view.selectObjects([object])
    await this.engine.insert.replaceSelectedImage(ref)
  }

  /** Resets a filled slot to its empty frame, keeping the photo's filters and place in the collage. */
  clearSlot(id: string): void {
    const view = this.view
    const object = view?.getById(id)
    if (!view || !object) return
    const d = asDory(object)
    const slot = d.slot
    if (!slot) return
    const placeholder = createPlaceholder({ x: slot.cx, y: slot.cy }, slot.width, slot.height, slot.mask)
    placeholder.set({ angle: slot.angle })
    const pd = asDory(placeholder)
    pd.id = d.id
    pd.name = d.name
    pd.field = d.field
    pd.locked = d.locked
    pd.link = d.link
    pd.animation = d.animation
    pd.effects = d.effects
    pd.collage = d.collage
    pd.filterSpecs = d.filterSpecs
    pd.maskRadius = slot.radius
    applyMask(placeholder)
    const index = view.canvas.getObjects().indexOf(object)
    view.canvas.remove(object)
    view.configure(placeholder)
    view.canvas.insertAt(Math.max(0, index), placeholder)
    placeholder.setCoords()
    view.selectObjects([placeholder])
    this.engine.commit(this.pageId, { label: 'Reset placeholder' })
  }

  setSlotTilt(id: string, angle: number): void {
    const view = this.view
    const object = view?.getById(id)
    if (!view || !object) return
    const d = asDory(object)
    const meta = readCollageMeta(d.collage)
    if (d.isPlaceholder) {
      object.set('angle', angle)
      if (meta) {
        for (const frame of view.canvas.getObjects()) {
          const fm = collageMetaOf(frame)
          if (fm?.id === meta.id && fm.role && fm.index === meta.index) {
            frame.set('angle', angle)
            frame.setCoords()
            frame.set('dirty', true)
          }
        }
      }
      applyMask(object)
    } else if (d.slot) {
      object.set('angle', angle)
      clampSlotImage(object)
    } else return
    object.set('dirty', true)
    view.canvas.requestRenderAll()
    this.engine.commit(this.pageId, { label: 'Tilt collage photo', coalesceKey: `collage:tilt:${id}` })
  }

  /** Pans a filled slot's picture to `dx`/`dy` page px from the centre of its frame. */
  setSlotPan(id: string, dx: number, dy: number): void {
    const view = this.view
    const object = view?.getById(id)
    const slot = object ? asDory(object).slot : undefined
    if (!view || !object || !slot) return
    object.setPositionByOrigin(new Point(slot.cx + dx, slot.cy + dy), 'center', 'center')
    clampSlotImage(object)
    object.set('dirty', true)
    view.canvas.requestRenderAll()
    this.engine.commit(this.pageId, { label: 'Pan collage photo', coalesceKey: `collage:pan:${id}` })
  }

  setSlotZoom(id: string, factor: number): void {
    const view = this.view
    const object = view?.getById(id)
    const slot = object ? asDory(object).slot : undefined
    if (!view || !object || !slot) return
    const next = clamp(Math.abs(object.scaleX) * factor, 0.001, 1000)
    object.set({ scaleX: next * (object.scaleX < 0 ? -1 : 1), scaleY: next * (object.scaleY < 0 ? -1 : 1) })
    clampSlotImage(object)
    object.set('dirty', true)
    view.canvas.requestRenderAll()
    this.engine.commit(this.pageId, { label: 'Zoom collage photo', coalesceKey: `collage:zoom:${id}` })
  }

  setSlotFilter(id: string, type: ImageFilterType, value: number): void {
    const view = this.view
    const object = view?.getById(id)
    if (!view || !object) return
    const d = asDory(object)
    const specs = normalizeSpecs(withSpec(d.filterSpecs, type, value))
    d.filterSpecs = specs
    if (object.type === 'image') applyImageFilters(object as never, specs)
    view.canvas.requestRenderAll()
    this.engine.commit(this.pageId, { label: 'Adjust image', coalesceKey: `collage:filter:${id}` })
  }

  /** Changes the crop shape of one frame; the photo is clipped to it at once. `null` is a rectangle. */
  setSlotMask(id: string, mask: MaskShape | null): void {
    const view = this.view
    const object = view?.getById(id)
    if (!view || !object) return
    const d = asDory(object)
    if (d.slot) {
      const slot: SlotSpec = { ...d.slot }
      if (mask) {
        slot.mask = mask
        if (mask === 'rounded' && slot.radius === undefined) slot.radius = DEFAULT_MASK_RADIUS
      } else {
        delete slot.mask
        delete slot.radius
      }
      d.slot = slot
      applySlotClip(object)
    } else {
      d.maskShape = mask ?? undefined
      if (mask === 'rounded' && d.maskRadius === undefined) d.maskRadius = DEFAULT_MASK_RADIUS
      applyMask(object)
    }
    object.set('dirty', true)
    view.canvas.requestRenderAll()
    this.engine.commit(this.pageId, { label: 'Change frame shape' })
  }

  /**
   * Trades the photos of two filled frames (position, size and shape stay with each frame). Both pictures are
   * re-fitted to their new frame, filters travel with the photo, and the whole swap is one undo step.
   */
  async swapSlots(aId: string, bId: string): Promise<void> {
    const view = this.view
    const first = view?.getById(aId)
    const second = view?.getById(bId)
    if (!view || !first || !second || first === second) return
    if (first.type !== 'image' || second.type !== 'image') return
    const da = asDory(first)
    const db = asDory(second)
    if (!da.slot || !db.slot || da.isPlaceholder || db.isPlaceholder) return
    const srcA = da.docSrc ?? da.slot.src ?? (first as FabricImage).getSrc()
    const srcB = db.docSrc ?? db.slot.src ?? (second as FabricImage).getSrc()
    if (!srcA || !srcB || srcA === srcB) return
    const [urlA, urlB] = await Promise.all([this.engine.assets.resolve(srcA), this.engine.assets.resolve(srcB)])
    // The page may have changed while the sources were resolving.
    if (!view.canvas.getObjects().includes(first) || !view.canvas.getObjects().includes(second)) return
    await Promise.all([
      (first as FabricImage).setSrc(urlB, { crossOrigin: 'anonymous' }),
      (second as FabricImage).setSrc(urlA, { crossOrigin: 'anonymous' }),
    ])
    this.applySwappedPhoto(first, srcB, db.assetId, db.filterSpecs)
    this.applySwappedPhoto(second, srcA, da.assetId, da.filterSpecs)
    view.canvas.requestRenderAll()
    this.engine.commit(this.pageId, { label: 'Swap collage photos' })
  }

  private applySwappedPhoto(object: FabricObject, src: string, assetId: string | undefined, filters: ImageFilterSpec[] | undefined): void {
    const d = asDory(object)
    const slot = d.slot
    if (!slot) return
    d.docSrc = src
    d.assetId = assetId
    d.filterSpecs = filters && filters.length > 0 ? [...filters] : undefined
    const img = object as FabricImage
    const width = img.getElement().width || img.width || 1
    const height = img.getElement().height || img.height || 1
    img.set({ cropX: 0, cropY: 0, width, height })
    const cover = coverSlotTransform(slot, width, height)
    img.set({ left: cover.cx, top: cover.cy, scaleX: cover.scale, scaleY: cover.scale, angle: slot.angle })
    applyImageFilters(img, d.filterSpecs ?? [])
    applyMask(img)
    img.setCoords()
    img.set('dirty', true)
  }

  applyFilterPreset(id: string, presetId: string): void {
    const preset = FILTER_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    const view = this.view
    const object = view?.getById(id)
    if (!view || !object) return
    const d = asDory(object)
    d.filterSpecs = preset.specs
    if (object.type === 'image') applyImageFilters(object as never, preset.specs)
    view.canvas.requestRenderAll()
    this.engine.commit(this.pageId, { label: 'Adjust image' })
  }

  /** Adds a right-to-left text box in one of the studio's Arabic families. */
  async addText(font: CollageFont, variant: CollageTextVariant): Promise<void> {
    const page = this.engine.pageSizeOf(this.pageId)
    const sample = TEXT_SAMPLE[variant]
    await this.engine.fonts.load(font, TEXT_WEIGHT[variant], 'normal', sample)
    const [{ textScale, createTextbox }, { fontStack }] = await Promise.all([
      import('../objects/factories'),
      import('../text/fontStack'),
    ])
    const k = textScale(page.width, page.height)
    const object = createTextbox(page, this.engine.insert.center(), {
      text: sample,
      fontFamily: fontStack(font, FONT_CATEGORY[font]),
      fontSize: Math.round(TEXT_SIZE[variant] * k),
      fontWeight: TEXT_WEIGHT[variant],
      fill: TEXT_COLOR[variant],
      textAlign: 'right',
      width: Math.round(page.width * 0.68),
    })
    const d = asDory(object)
    d.name = `${font} ${variant}`
    d.textDir = 'rtl'
    syncDirection(object as unknown as IText)
    this.engine.rememberFont(font)
    await this.engine.insert.add([object], 'Add text', { edit: true })
  }

  async addSticker(asset: LocalAsset): Promise<void> {
    if (asset.type === 'svg') {
      const res = await fetch(asset.url, { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!text.trimStart().startsWith('<svg')) throw new Error('Not an SVG')
      await this.engine.insert.svgElement(text, `local:${asset.path}`, asset.name)
      return
    }
    await this.engine.insert.imageFromAsset({ id: `local:${asset.path}`, url: asset.url, thumbUrl: asset.url, width: 0, height: 0, name: asset.name, kind: 'image' })
  }
}
