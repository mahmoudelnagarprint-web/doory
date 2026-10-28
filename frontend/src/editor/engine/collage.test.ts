import { FabricImage } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { installImageStub } from '../test/imageStub'
import { EditorEngine } from './editor'
import { asDory } from './objects/dory'
import { collageGroups, collageMetaOf, readCollageMeta, slotOfDocObject } from './collage/model'
import type { CollageMeta, SlotSpec } from '@/types/document'

function setup(width = 559, height = 794) {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(width, height), meta: { id: 'd1', title: 'Test', mode: 'guest' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  return { engine, handle, pageId, host }
}

const asset = (engine: EditorEngine) => engine.assets.upload(new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }), 'photo.png')
const objectsOf = (engine: EditorEngine) => engine.state.doc.pages[0].objects
const slots = (engine: EditorEngine, id: string) => collageGroups(objectsOf(engine)).find((group) => group.id === id)?.slots ?? []

describe('Smart Collage Studio engine', () => {
  let restore: () => void

  beforeEach(() => {
    restore = installImageStub({ width: 600, height: 300 })
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined)
    URL.createObjectURL = vi.fn(() => 'blob:fake')
  })

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 40))
    vi.restoreAllMocks()
    restore()
    document.body.innerHTML = ''
  })

  it('creates four slots with a mat and inner ring each, and selects the first slot', async () => {
    const { engine, pageId } = setup()
    const view = await engine.whenView(pageId)
    const id = await engine.collage.create()

    const objects = objectsOf(engine)
    expect(objects).toHaveLength(12)
    const group = collageGroups(objects).find((item) => item.id === id)
    expect(group?.slots).toHaveLength(4)
    expect(objects.filter((object) => collageMetaOf(object)?.role === 'mat')).toHaveLength(4)
    expect(objects.filter((object) => collageMetaOf(object)?.role === 'inner')).toHaveLength(4)
    expect(engine.state.selection.ids).toEqual([group?.slots[0].id])
    for (const slot of group?.slots ?? []) {
      expect((slot as { isPlaceholder?: boolean }).isPlaceholder).toBe(true)
      expect((slot as { collage?: CollageMeta }).collage?.layout).toBe('grid')
    }
    // The frames are document objects but never selectable on the canvas.
    for (const frame of view.canvas.getObjects().filter((object) => collageMetaOf(object)?.role)) {
      expect(frame.selectable).toBe(false)
      expect(frame.evented).toBe(false)
    }
    engine.dispose()
  })

  it('fills a slot from an asset without leaving the collage', async () => {
    const { engine, pageId } = setup()
    await engine.whenView(pageId)
    const id = await engine.collage.create()
    const first = slots(engine, id)[0]
    await engine.collage.replaceSlotWithAsset(pageId, first.id, await asset(engine))

    const filled = objectsOf(engine).find((object) => object.id === first.id)
    expect(filled?.type).toBe('image')
    expect(filled?.slot).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
    expect((filled as { collage?: CollageMeta }).collage).toMatchObject({ id, layout: 'grid', index: 0 })
    expect(collageGroups(objectsOf(engine)).find((group) => group.id === id)?.slots).toHaveLength(4)
    expect(engine.state.selection.ids).toEqual([first.id])
    engine.dispose()
  })

  it('re-flows every template and keeps the filled photo by id', async () => {
    const { engine, pageId } = setup()
    await engine.whenView(pageId)
    const id = await engine.collage.create()
    const first = slots(engine, id)[0]
    await engine.collage.replaceSlotWithAsset(pageId, first.id, await asset(engine))

    for (const template of ['hero', 'mosaic', 'strip', 'masonry', 'polaroid', 'arch', 'grid'] as const) {
      engine.collage.setLayout(id, template)
      const group = collageGroups(objectsOf(engine)).find((item) => item.id === id)
      expect(group?.layout).toBe(template)
      expect(group?.slots).toHaveLength(4)
      expect(group?.slots[0].id).toBe(first.id)
      expect((group?.slots[0] as { type?: string }).type).toBe('image')
      const frame = slotOfDocObject(group!.slots[0])
      expect(frame?.width).toBeGreaterThan(0)
      expect(frame?.height).toBeGreaterThan(0)
    }
    engine.dispose()
  })

  it('adds and releases slots without deleting photos, and mirrors for RTL', async () => {
    const { engine, pageId } = setup()
    await engine.whenView(pageId)
    const id = await engine.collage.create()
    const first = slots(engine, id)[0]
    await engine.collage.replaceSlotWithAsset(pageId, first.id, await asset(engine))

    engine.collage.setCount(id, 6)
    let group = collageGroups(objectsOf(engine)).find((item) => item.id === id)
    expect(group?.slots).toHaveLength(6)
    expect(objectsOf(engine)).toHaveLength(18)

    engine.collage.setRtl(id, true)
    const left = slotOfDocObject(slots(engine, id)[0])
    const right = slotOfDocObject(slots(engine, id)[1])
    expect(left!.cx).toBeGreaterThan(right!.cx)

    engine.collage.setCount(id, 2)
    group = collageGroups(objectsOf(engine)).find((item) => item.id === id)
    expect(group?.slots).toHaveLength(2)
    expect(objectsOf(engine)).toHaveLength(6)
    // The filled first slot stayed a picture; its two empty siblings were removed.
    expect(objectsOf(engine).find((object) => object.id === first.id)?.type).toBe('image')
    engine.dispose()
  })

  it('survives a reload with its collage metadata and frame companions', async () => {    const { engine, pageId, handle } = setup()
    const view = await engine.whenView(pageId)
    const id = await engine.collage.create({ template: 'arch' })
    const first = slots(engine, id)[0]
    await engine.collage.replaceSlotWithAsset(pageId, first.id, await asset(engine))
    engine.collage.setLayout(id, 'mosaic')
    const doc = structuredClone(engine.state.doc)
    engine.dispose()

    const again = new EditorEngine({ adapter: handle.adapter, document: doc, meta: { id: 'd2', title: 'Again', mode: 'guest' }, ephemeral: true })
    const host = document.createElement('div')
    document.body.appendChild(host)
    again.mountPage(doc.pages[0].id, host)
    const reloaded = await again.whenView(doc.pages[0].id)
    await vi.waitFor(() => expect(reloaded.canvas.getObjects()).toHaveLength(12))

    const group = collageGroups(again.state.doc.pages[0].objects).find((item) => item.id === id)
    expect(group?.layout).toBe('mosaic')
    expect(group?.slots).toHaveLength(4)
    expect((group?.slots[0] as { type?: string }).type).toBe('image')
    const meta = readCollageMeta((group?.slots[0] as { collage?: unknown }).collage)
    expect(meta).toMatchObject({ id, layout: 'mosaic', index: 0 })
    for (const frame of reloaded.canvas.getObjects().filter((object) => asDory(object).collage?.role)) {
      expect(frame.selectable).toBe(false)
      expect(frame.evented).toBe(false)
    }
    again.dispose()
    void view
  })

  it('changes a frame shape and clips the filled photo to it', async () => {
    const { engine, pageId } = setup()
    await engine.whenView(pageId)
    const id = await engine.collage.create()
    const first = slots(engine, id)[0]
    engine.collage.setSlotMask(first.id, 'circle')
    expect(objectsOf(engine).find((object) => object.id === first.id)?.maskShape).toBe('circle')
    await engine.collage.replaceSlotWithAsset(pageId, first.id, await asset(engine))
    const filled = () => objectsOf(engine).find((object) => object.id === first.id)
    expect((filled()?.slot as SlotSpec).mask).toBe('circle')
    engine.collage.setSlotMask(first.id, 'hexagon')
    expect((filled()?.slot as SlotSpec).mask).toBe('hexagon')
    engine.collage.setSlotMask(first.id, null)
    expect((filled()?.slot as SlotSpec).mask).toBeUndefined()
    engine.dispose()
  })

  it('swaps two photos with their treatments and keeps each frame in place', async () => {
    vi.spyOn(FabricImage.prototype, 'applyFilters').mockImplementation(() => undefined)
    const { engine, pageId } = setup()
    await engine.whenView(pageId)
    const id = await engine.collage.create()
    const [a, b] = slots(engine, id)
    await engine.collage.replaceSlotWithAsset(pageId, a.id, await asset(engine))
    await engine.collage.replaceSlotWithAsset(pageId, b.id, await asset(engine))
    const beforeA = { ...objectsOf(engine).find((object) => object.id === a.id) }
    const beforeB = { ...objectsOf(engine).find((object) => object.id === b.id) }
    engine.collage.setSlotFilter(a.id, 'saturation', 0.25)
    const treatment = objectsOf(engine).find((object) => object.id === a.id)?.filterSpecs
    await engine.collage.swapSlots(a.id, b.id)

    const afterA = objectsOf(engine).find((object) => object.id === a.id)
    const afterB = objectsOf(engine).find((object) => object.id === b.id)
    expect(afterA?.docSrc).toBe(beforeB.docSrc)
    expect(afterB?.docSrc).toBe(beforeA.docSrc)
    expect(afterA?.assetId).toBe(beforeB.assetId)
    expect(afterA?.slot).toEqual(beforeA.slot)
    expect(afterB?.slot).toEqual(beforeB.slot)
    expect(afterA?.filterSpecs).toBeUndefined()
    expect(afterB?.filterSpecs).toEqual(treatment)
    expect(objectsOf(engine)).toHaveLength(12)
    engine.dispose()
  })
})
