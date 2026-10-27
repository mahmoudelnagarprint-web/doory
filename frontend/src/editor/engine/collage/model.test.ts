import type { CollageMeta, DocObject } from '@/types/document'
import { defaultCollageStyle } from './layout'
import { collageGroups, collageInSelection, pointInSlot, readCollageMeta, slotAt, slotOfDocObject } from './model'

const bounds = { x: 0, y: 0, width: 559, height: 794 }
const style = defaultCollageStyle({ width: 559, height: 794 })

const meta = (patch: Partial<CollageMeta> = {}): CollageMeta => ({
  id: 'c1',
  name: 'Wall',
  layout: 'grid',
  gap: 10,
  margin: 30,
  rtl: false,
  index: 0,
  bounds,
  style,
  ...patch,
})

const placeholder = (index: number, patch: Partial<DocObject> = {}): DocObject => ({
  id: `slot-${index}`,
  type: 'rect',
  isPlaceholder: true,
  left: 100 + index * 120,
  top: 150,
  width: 100,
  height: 80,
  originX: 'center',
  originY: 'center',
  angle: 0,
  collage: meta({ index }),
  ...patch,
})

const filled = (index: number, patch: Partial<DocObject> = {}): DocObject => ({
  ...placeholder(index),
  type: 'image',
  isPlaceholder: false,
  docSrc: 'idb://photo',
  slot: { cx: 100 + index * 120, cy: 150, width: 100, height: 80, angle: 0, src: 'idb://photo' },
  ...patch,
})

describe('collage document model', () => {
  it('reads a complete meta and strips an unknown role', () => {
    const read = readCollageMeta(meta({ role: 'mat' }))
    expect(read).toMatchObject({ id: 'c1', name: 'Wall', layout: 'grid', index: 0, role: 'mat' })
    expect(readCollageMeta({ ...meta(), role: 'nope' })?.role).toBeUndefined()
  })

  it('rejects meta without an id and tolerates broken numbers', () => {
    expect(readCollageMeta(null)).toBeUndefined()
    expect(readCollageMeta({ id: '' })).toBeUndefined()
    const read = readCollageMeta({ id: 'c2', gap: 'wide', margin: -8, index: 99, rtl: true, style: { matWidth: 'big' } })
    expect(read).toMatchObject({ id: 'c2', gap: 8, margin: 0, index: 99, rtl: true })
    expect(read?.style.matWidth).toBe(8)
  })

  it('groups only slots, in reading order, and ignores the mat/inner frames', () => {
    const objects: DocObject[] = [
      placeholder(1),
      placeholder(0),
      { id: 'mat-0', type: 'rect', collage: meta({ index: 0, role: 'mat' }) },
      { id: 'inner-0', type: 'rect', collage: meta({ index: 0, role: 'inner' }) },
    ]
    const groups = collageGroups(objects)
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Wall')
    expect(groups[0].slots.map((slot) => slot.id)).toEqual(['slot-0', 'slot-1'])
  })

  it('finds the first selected slot but not a selected frame', () => {
    expect(collageInSelection([{ id: 'mat', type: 'rect', collage: meta({ role: 'mat' }) }])).toBeUndefined()
    expect(collageInSelection([placeholder(2)])).toEqual({ id: 'c1', slot: placeholder(2) })
  })

  it('derives a frame from a placeholder centred on its origin', () => {
    const slot = slotOfDocObject(placeholder(0, { width: 200, height: 100, scaleX: 0.5, scaleY: 0.5 }))
    expect(slot).toMatchObject({ cx: 100, cy: 150, width: 100, height: 50, angle: 0 })
  })

  it('uses the stored frame of a filled picture', () => {
    expect(slotOfDocObject(filled(1))).toMatchObject({ cx: 220, cy: 150, width: 100, height: 80 })
  })

  it('hit-tests a rotated frame in the frame’s own axes', () => {
    const slot = { cx: 100, cy: 100, width: 100, height: 50, angle: 90 }
    expect(pointInSlot(slot, { x: 120, y: 100 })).toBe(true)
    expect(pointInSlot(slot, { x: 100, y: 120 })).toBe(true)
    expect(pointInSlot(slot, { x: 140, y: 100 })).toBe(false)
  })

  it('returns the topmost slot under a point and says whether it is filled', () => {
    const objects = [filled(0), filled(0, { id: 'slot-top', collage: meta({ index: 1 }) })]
    const hit = slotAt(objects, { x: 100, y: 150 })
    expect(hit?.id).toBe('slot-top')
    expect(hit?.filled).toBe(true)
  })

  it('ignores hidden objects and frame companions when hit-testing', () => {
    const objects = [
      placeholder(0),
      { id: 'mat', type: 'rect', collage: meta({ role: 'mat' }), left: 100, top: 150, width: 200, height: 200, originX: 'center', originY: 'center' },
      placeholder(0, { id: 'hidden', visible: false, left: 300 }),
    ]
    expect(slotAt(objects, { x: 100, y: 150 })?.id).toBe('slot-0')
  })
})
