/**
 * Tolerant readers for the `collage` metadata stored on slots and their companion frames.
 *
 * The document is untrusted input: anything malformed is ignored or replaced by a safe default so a
 * hand-edited or older design still opens. Nothing here needs a Fabric canvas except `slotAtLive`.
 */
import type { FabricObject } from 'fabric'
import type { CollageBounds, CollageLayoutId, CollageMeta, CollageRole, CollageStyle, DocObject, SlotSpec } from '@/types/document'
import { asDory } from '../objects/dory'
import { slotOf, validSlot } from '../objects/slot'
import { COLLAGE_LAYOUTS } from './layout'

const num = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const text = (value: unknown, fallback: string): string => (typeof value === 'string' && value.trim() ? value : fallback)
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

const FALLBACK_STYLE: CollageStyle = {
  matColor: '#f5efe2',
  matWidth: 8,
  outerColor: '#d4af37',
  outerWidth: 2,
  innerColor: '#d4af37',
  innerWidth: 2,
  radius: 8,
}

function readBounds(raw: unknown): CollageBounds | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const b = raw as Record<string, unknown>
  const width = num(b.width, 0)
  const height = num(b.height, 0)
  if (width <= 0 || height <= 0) return undefined
  return { x: num(b.x, 0), y: num(b.y, 0), width, height }
}

function readStyle(raw: unknown): CollageStyle {
  if (!raw || typeof raw !== 'object') return { ...FALLBACK_STYLE }
  const s = raw as Record<string, unknown>
  const shadow = s.shadow && typeof s.shadow === 'object' ? (s.shadow as Record<string, unknown>) : null
  return {
    matColor: text(s.matColor, FALLBACK_STYLE.matColor),
    matWidth: clamp(num(s.matWidth, FALLBACK_STYLE.matWidth), 0, 400),
    outerColor: text(s.outerColor, FALLBACK_STYLE.outerColor),
    outerWidth: clamp(num(s.outerWidth, FALLBACK_STYLE.outerWidth), 0, 80),
    innerColor: text(s.innerColor, FALLBACK_STYLE.innerColor),
    innerWidth: clamp(num(s.innerWidth, FALLBACK_STYLE.innerWidth), 0, 80),
    radius: clamp(num(s.radius, FALLBACK_STYLE.radius), 0, 2000),
    shadow: shadow
      ? {
          color: text(shadow.color, 'rgba(0,0,0,0.42)'),
          blur: clamp(num(shadow.blur, 16), 0, 400),
          offsetX: clamp(num(shadow.offsetX, 0), -400, 400),
          offsetY: clamp(num(shadow.offsetY, 6), -400, 400),
        }
      : undefined,
  }
}

function isLayout(value: unknown): value is CollageLayoutId {
  return typeof value === 'string' && (COLLAGE_LAYOUTS as readonly string[]).includes(value)
}

/** Reads one stored collage meta, or undefined when it is not usable at all (no id). */
export function readCollageMeta(raw: unknown): CollageMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const c = raw as Record<string, unknown>
  const id = typeof c.id === 'string' && c.id.length > 0 ? c.id : undefined
  if (!id) return undefined
  const bounds = readBounds(c.bounds) ?? { x: 0, y: 0, width: 1000, height: 1000 }
  const role: CollageRole | undefined = c.role === 'mat' || c.role === 'inner' ? c.role : undefined
  return {
    id,
    name: typeof c.name === 'string' && c.name.trim() ? c.name : undefined,
    layout: isLayout(c.layout) ? c.layout : 'grid',
    gap: clamp(num(c.gap, 8), 0, 2000),
    margin: clamp(num(c.margin, 24), 0, 2000),
    rtl: c.rtl === true,
    index: Math.round(clamp(num(c.index, 0), 0, 999)),
    bounds,
    style: readStyle(c.style),
    role,
  }
}

export function collageMetaOf(obj: DocObject | FabricObject): CollageMeta | undefined {
  return readCollageMeta(asDory(obj as FabricObject).collage ?? (obj as DocObject).collage)
}

/** True for the non-interactive mat/inner companions, false for the slots themselves. */
export function isCollageFrame(obj: DocObject | FabricObject): boolean {
  return !!collageMetaOf(obj)?.role
}

/** The slots of one collage, in reading order. Frames are excluded. */
export function slotsOf(objects: readonly DocObject[], collageId: string): DocObject[] {
  return objects
    .map((object) => ({ object, meta: collageMetaOf(object) }))
    .filter(({ meta }) => meta?.id === collageId && !meta.role)
    .sort((a, b) => (a.meta?.index ?? 0) - (b.meta?.index ?? 0))
    .map(({ object }) => object)
}

export interface CollageGroup {
  id: string
  name: string
  layout: CollageLayoutId
  gap: number
  margin: number
  rtl: boolean
  bounds: CollageBounds
  style: CollageStyle
  slots: DocObject[]
}

/** All collages on one page, keyed by their shared id and ordered by their first slot. */
export function collageGroups(objects: readonly DocObject[]): CollageGroup[] {
  const groups = new Map<string, DocObject[]>()
  for (const object of objects) {
    const meta = collageMetaOf(object)
    if (!meta || meta.role) continue
    const list = groups.get(meta.id)
    if (list) list.push(object)
    else groups.set(meta.id, [object])
  }
  const out: CollageGroup[] = []
  for (const [id, slots] of groups) {
    const sorted = [...slots].sort((a, b) => (collageMetaOf(a)?.index ?? 0) - (collageMetaOf(b)?.index ?? 0))
    const meta = collageMetaOf(sorted[0])
    if (!meta) continue
    out.push({
      id,
      name: meta.name ?? 'Collage',
      layout: meta.layout,
      gap: meta.gap,
      margin: meta.margin,
      rtl: meta.rtl,
      bounds: meta.bounds,
      style: meta.style,
      slots: sorted,
    })
  }
  return out.sort((a, b) => (collageMetaOf(a.slots[0])?.index ?? 0) - (collageMetaOf(b.slots[0])?.index ?? 0) || a.id.localeCompare(b.id))
}

/** The collage of the first selected slot, if the selection is inside one. */
export function collageInSelection(objects: readonly DocObject[]): { id: string; slot: DocObject } | undefined {
  for (const object of objects) {
    const meta = collageMetaOf(object)
    if (meta && !meta.role) return { id: meta.id, slot: object }
  }
  return undefined
}

function centerOfDocObject(object: DocObject): { x: number; y: number; width: number; height: number } {
  const width = Math.abs(num(object.width, 1) * num(object.scaleX, 1))
  const height = Math.abs(num(object.height, 1) * num(object.scaleY, 1))
  const left = num(object.left, 0)
  const top = num(object.top, 0)
  const originX = typeof object.originX === 'string' ? object.originX : 'left'
  const originY = typeof object.originY === 'string' ? object.originY : 'top'
  const x = originX === 'center' ? left : originX === 'right' ? left - width / 2 : left + width / 2
  const y = originY === 'center' ? top : originY === 'bottom' ? top - height / 2 : top + height / 2
  return { x, y, width, height }
}

/** The frame of a serialised placeholder, or the stored frame of a filled picture. */
export function slotOfDocObject(object: DocObject): SlotSpec | undefined {
  const stored = validSlot(object.slot)
  if (stored) return stored
  if (object.isPlaceholder !== true) return undefined
  const box = centerOfDocObject(object)
  return {
    cx: box.x,
    cy: box.y,
    width: Math.max(1, box.width),
    height: Math.max(1, box.height),
    angle: num(object.angle, 0),
    ...(typeof object.maskShape === 'string' || (object.maskShape && typeof object.maskShape === 'object') ? { mask: object.maskShape as SlotSpec['mask'] } : {}),
    ...(typeof object.maskRadius === 'number' ? { radius: object.maskRadius } : {}),
  }
}

export function pointInSlot(slot: SlotSpec, point: { x: number; y: number }): boolean {
  const dx = point.x - slot.cx
  const dy = point.y - slot.cy
  const rad = (-slot.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos
  return Math.abs(localX) <= slot.width / 2 && Math.abs(localY) <= slot.height / 2
}

export interface SlotHit {
  id: string
  object: DocObject
  slot: SlotSpec
  /** Empty placeholders get filled; filled pictures get replaced. */
  filled: boolean
  collage?: CollageMeta
}

/** The topmost slot under a page-space point in serialised objects (used by drops and tests). */
export function slotAt(objects: readonly DocObject[], point: { x: number; y: number }): SlotHit | undefined {
  for (let i = objects.length - 1; i >= 0; i--) {
    const object = objects[i]
    if (object.visible === false) continue
    const meta = collageMetaOf(object)
    if (meta?.role) continue
    const slot = slotOfDocObject(object)
    if (!slot || !pointInSlot(slot, point)) continue
    return { id: object.id, object, slot, filled: object.isPlaceholder !== true && !!object.slot, collage: meta }
  }
  return undefined
}

/** The same hit test against live Fabric objects, for drops before the page has been serialised. */
export function slotAtLive(objects: readonly FabricObject[], point: { x: number; y: number }): SlotHit | undefined {
  for (let i = objects.length - 1; i >= 0; i--) {
    const object = objects[i]
    if (object.visible === false) continue
    const d = asDory(object)
    const meta = readCollageMeta(d.collage)
    if (meta?.role) continue
    const slot = d.slot ?? (d.isPlaceholder ? slotOf(object) : undefined)
    if (!slot || !pointInSlot(slot, point)) continue
    const id = d.id
    if (!id) continue
    const serialised = object as unknown as DocObject
    return { id, object: serialised, slot, filled: d.isPlaceholder !== true && !!d.slot, collage: meta }
  }
  return undefined
}
