import { Group, Path } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorEngine } from '../editor'
import { asDory } from '../objects/dory'
import { CUT_LINE_COLOR, CutLineError, cutLineOffsetPx } from './cutline'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#222222"/></svg>'

async function setup() {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({ adapter: handle.adapter, document: createBlankDocument(800, 600), meta: { id: 'd', title: 'T', mode: 'guest' }, ephemeral: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
  await engine.insert.svgElement(SVG, 'test-element', 'Test element')
  await vi.waitFor(() => expect(view.canvas.getObjects()).toHaveLength(1))
  return { engine, view }
}

const firstDocObject = (engine: EditorEngine): Record<string, unknown> => engine.state.doc.pages[0].objects[0] as unknown as Record<string, unknown>

describe('CutLineApi', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('converts the millimetre bleed to page pixels', () => {
    expect(cutLineOffsetPx(2)).toBeCloseTo(7.559, 2)
    expect(cutLineOffsetPx(-4)).toBe(0)
    expect(cutLineOffsetPx(Number.NaN)).toBeCloseTo(7.559, 2)
  })

  it('traces the element, puts the 1 px contour behind it, and makes one history step', async () => {
    const { engine, view } = await setup()
    const original = view.canvas.getObjects()[0]
    const before = original.getBoundingRect()

    expect(await engine.cutline.generate(2)).toBe(true)

    const objects = view.canvas.getObjects()
    expect(objects).toHaveLength(1)
    const group = objects[0] as Group
    expect(group).toBeInstanceOf(Group)
    expect(group.getObjects()).toHaveLength(2)
    const [cut, art] = group.getObjects()
    expect(cut).toBeInstanceOf(Path)
    expect(art).toBe(original)
    expect(cut).toMatchObject({ stroke: CUT_LINE_COLOR, strokeWidth: 1, strokeUniform: true, fill: null })
    expect(asDory(cut).name).toBe('Cut line')
    expect(view.canvas.getActiveObject()).toBe(group)

    const cutBounds = cut.getBoundingRect()
    expect(cutBounds.left).toBeLessThan(before.left - 5)
    expect(cutBounds.top).toBeLessThan(before.top - 5)
    expect(cutBounds.left + cutBounds.width).toBeGreaterThan(before.left + before.width + 5)
    expect(cutBounds.top + cutBounds.height).toBeGreaterThan(before.top + before.height + 5)
    expect(cutBounds.left).toBeGreaterThan(before.left - 12)

    const docObject = firstDocObject(engine)
    expect(docObject.type).toBe('group')
    expect(docObject.objects).toHaveLength(2)
    expect((docObject.objects as Record<string, unknown>[])[0]).toMatchObject({ type: 'path', stroke: CUT_LINE_COLOR, name: 'Cut line' })
    expect(engine.history.depth).toBe(2)

    await engine.undo()
    expect(engine.history.depth).toBe(1)
    expect(engine.state.doc.pages[0].objects).toHaveLength(1)
    expect(firstDocObject(engine).type).toBe('rect')

    await engine.redo()
    expect(firstDocObject(engine).objects).toHaveLength(2)
    expect((firstDocObject(engine).objects as Record<string, unknown>[])[0]).toMatchObject({ type: 'path', name: 'Cut line' })

    engine.dispose()
  }, 20000)

  it('persists the group and its contour with the design', async () => {
    const { engine } = await setup()
    expect(await engine.cutline.generate(3)).toBe(true)
    const saved = structuredClone(engine.getDocument())
    engine.dispose()

    const reopened = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: saved, meta: { id: 'd2', title: 'Again', mode: 'guest' }, ephemeral: true })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const pageId = reopened.state.doc.pages[0].id
    reopened.mountPage(pageId, host)
    const view = await reopened.whenView(pageId)
    await vi.waitFor(() => expect(view.canvas.getObjects()).toHaveLength(1))
    const group = view.canvas.getObjects()[0] as Group
    expect(group.getObjects()).toHaveLength(2)
    expect(group.getObjects()[0]).toBeInstanceOf(Path)
    expect(group.getObjects()[0].stroke).toBe(CUT_LINE_COLOR)
    reopened.dispose()
  }, 20000)

  it('does not trace an object with no visible pixels', async () => {
    const { engine, view } = await setup()
    const obj = view.canvas.getObjects()[0]
    obj.set({ opacity: 0 })
    view.selectObjects([obj])
    await expect(engine.cutline.generate(2)).rejects.toBeInstanceOf(CutLineError)
    expect(view.canvas.getObjects()).toHaveLength(1)
    engine.dispose()
  })
})
