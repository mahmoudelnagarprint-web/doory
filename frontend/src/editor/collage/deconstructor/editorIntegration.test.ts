/**
 * Design Decomposer ↔ editor integration tests.
 *
 * These run against a REAL `EditorEngine` (memory adapter, mounted page, Fabric canvas), not a stub, because
 * the acceptance criteria are about what actually lands on the canvas: one history step for the whole
 * decomposition, every layer independently selectable/movable/deletable, undo/redo working afterwards, the
 * untouched original preserved as its own layer, and the source→page geometry and opacity preserved.
 */
import { FabricImage } from 'fabric'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorEngine } from '../../engine/editor'
import { asDory } from '../../engine/objects/dory'
import { installImageStub } from '../../test/imageStub'
import { ORIGINAL_LAYER_NAME, commitLayers, layerToPlacement } from './commitLayers'
import type { ExtractedLayer, PipelineResult } from './types'

/** A 1x1 transparent PNG: the image bytes never matter here, `installImageStub` decides the natural size. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** Every image in these tests decodes as 1600x1200 (the analysis raster the pipeline would have used). */
const SOURCE = { width: 1600, height: 1200 }
const PAGE = { width: 800, height: 600 }

function layer(patch: Partial<ExtractedLayer> & Pick<ExtractedLayer, 'id' | 'name' | 'bounds' | 'page' | 'zIndex'>): ExtractedLayer {
  return {
    layerClass: 'decoration',
    croppedDataUrl: PNG,
    fullCanvasDataUrl: PNG,
    alphaMaskDataUrl: PNG,
    rotation: 0,
    opacity: 1,
    confidence: 0.9,
    extractionMethod: 'model-segmentation',
    source: { url: 'blob:source', ...SOURCE },
    editableProperties: { movable: true, resizable: true, removable: true, textEditable: false },
    ...patch,
  }
}

function makeResult(): PipelineResult {
  return {
    status: 'ready',
    input: { imageUrl: 'blob:source', width: SOURCE.width, height: SOURCE.height, pageWidth: PAGE.width, pageHeight: PAGE.height },
    originalDataUrl: PNG,
    layers: [
      // 400x300 source px covering a 200x150 page rect at (50,25): exactly a 0.5 scale.
      layer({
        id: 'layer-a',
        name: 'زخرفة أ',
        bounds: { x: 100, y: 50, width: 400, height: 300 },
        page: { x: 50, y: 25, width: 200, height: 150 },
        zIndex: 0,
        rotation: 12,
        opacity: 0.5,
        layerClass: 'sticker',
      }),
      layer({
        id: 'layer-b',
        name: 'زخرفة ب',
        bounds: { x: 900, y: 600, width: 200, height: 200 },
        page: { x: 450, y: 300, width: 100, height: 100 },
        zIndex: 1,
        layerClass: 'text',
        text: { content: '', fontFamily: 'Cairo', fontSize: 40, color: '#000', align: 'center', direction: 'rtl', recognised: false, engine: null },
      }),
    ],
    background: { originalDataUrl: PNG, reconstructedDataUrl: null, method: null },
    compositeDataUrl: PNG,
    warnings: [],
    segmentationProviderId: 'classical',
    neural: false,
    durationMs: 12,
  }
}

/** Every engine built by a test, disposed in `afterEach` so no canvas render outlives its mocks. */
const live: EditorEngine[] = []

async function setup() {
  const handle = createMemoryAdapter()
  const engine = new EditorEngine({
    adapter: handle.adapter,
    document: createBlankDocument(PAGE.width, PAGE.height),
    meta: { id: 'd1', title: 'Test', mode: 'guest' },
    ephemeral: true,
  })
  live.push(engine)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const pageId = engine.state.doc.pages[0].id
  engine.mountPage(pageId, host)
  const view = await engine.whenView(pageId)
  view.setLayout(1, { x: 0, y: 0, width: PAGE.width, height: PAGE.height })
  return { engine, view, pageId }
}

/** Lets a queued canvas/history render settle before asserting. */
const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const names = (engine: EditorEngine) => engine.state.doc.pages[0].objects.map((o) => (o as { name?: string }).name)

describe('Design Decomposer → editor integration', () => {
  let restoreImage: () => void

  beforeAll(() => {
    // Fabric queues canvas renders on animation frames, so a render from one test can fire after its teardown.
    // Keeping these stubs alive for the whole file (instead of restoring them per test) stops jsdom's canvas
    // from trying to draw a stubbed <img> and raising an unhandled error mid-run.
    vi.spyOn(FabricImage.prototype, 'render').mockImplementation(() => undefined)
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined)
    // jsdom keeps one shared 2D implementation behind every context it hands out; a stubbed <img> is not an
    // object it will draw, and a queued render would otherwise raise an unhandled error after teardown.
    const probe = document.createElement('canvas').getContext('2d')
    if (probe) vi.spyOn(Object.getPrototypeOf(probe) as { drawImage: () => void }, 'drawImage').mockImplementation(() => undefined)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'], { type: 'image/webp' })))
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    live.length = 0
    restoreImage = installImageStub(SOURCE)
  })

  afterEach(() => {
    for (const engine of live) engine.dispose()
    live.length = 0
    restoreImage()
    document.body.innerHTML = ''
  })

  it('adds the untouched original plus every layer as real document objects, back to front', async () => {
    const { engine, view, pageId } = await setup()
    const out = await commitLayers(engine, makeResult(), { pageId })

    expect(out.added).toBe(3)
    expect(out.pageId).toBe(pageId)
    expect(view.canvas.getObjects()).toHaveLength(3)
    expect(engine.state.doc.pages[0].objects).toHaveLength(3)
    // The original is the bottom layer, then zIndex order.
    expect(names(engine)).toEqual([ORIGINAL_LAYER_NAME, 'زخرفة أ', 'زخرفة ب'])
    expect(out.objectIds).toHaveLength(3)
  })

  it('maps source pixels to page pixels exactly, and keeps rotation and opacity', async () => {
    const { engine, view, pageId } = await setup()
    await commitLayers(engine, makeResult(), { pageId })
    // The commit selects the new layers, so Fabric holds them in an ActiveSelection whose children report
    // group-relative `left`/`top`. Deselect first: the page-space centre is what must be preserved.
    engine.clearSelection()

    const objects = view.canvas.getObjects()
    const a = objects[1]
    expect(asDory(a).name).toBe('زخرفة أ')
    // 400x300 source px shown over a 200x150 page rect on a 1600x1200 full-canvas image → scale 0.5, and the
    // element's page centre — (50 + 200/2, 25 + 150/2) = (150, 100) — sits on the shared canvas centre grid, so
    // the full-canvas object (whose centre is the page centre) is centred at (400, 300).
    expect(a.get('scaleX')).toBeCloseTo(0.5, 5)
    expect(a.get('scaleY')).toBeCloseTo(0.5, 5)
    const centre = a.getCenterPoint()
    expect(centre.x).toBeCloseTo(400, 5)
    expect(centre.y).toBeCloseTo(300, 5)
    expect(a.get('angle')).toBeCloseTo(12, 5)
    expect(a.get('opacity')).toBeCloseTo(0.5, 5)
  })

  it('records the whole decomposition as ONE undo step, and redo restores it', async () => {
    const { engine, pageId } = await setup()
    await commitLayers(engine, makeResult(), { pageId })
    expect(engine.state.history.canUndo).toBe(true)

    await engine.undo()
    await settle()
    expect(engine.state.doc.pages[0].objects).toHaveLength(0)

    await engine.redo()
    await settle()
    expect(engine.state.doc.pages[0].objects).toHaveLength(3)
    expect(names(engine)).toEqual([ORIGINAL_LAYER_NAME, 'زخرفة أ', 'زخرفة ب'])
  })

  it('lets one layer move without disturbing the others, and undo puts it back', async () => {
    const { engine, view, pageId } = await setup()
    await commitLayers(engine, makeResult(), { pageId })

    const [original, a, b] = view.canvas.getObjects()
    const originalBefore = { left: original.get('left'), top: original.get('top') }
    const bBefore = { left: b.get('left'), top: b.get('top') }
    const aBefore = { left: a.get('left'), top: a.get('top') }

    a.set({ left: (a.get('left') as number) + 40, top: (a.get('top') as number) + 25 })
    a.setCoords()
    engine.commit(pageId, { label: 'move layer' })

    expect(b.get('left')).toBeCloseTo(bBefore.left as number, 5)
    expect(b.get('top')).toBeCloseTo(bBefore.top as number, 5)
    expect(original.get('left')).toBeCloseTo(originalBefore.left as number, 5)
    expect(a.get('left')).toBeCloseTo((aBefore.left as number) + 40, 5)

    await engine.undo()
    await settle()
    const afterUndo = view.canvas.getObjects()[1]
    expect(afterUndo.get('left')).toBeCloseTo(aBefore.left as number, 5)
    expect(afterUndo.get('top')).toBeCloseTo(aBefore.top as number, 5)
  })

  it('keeps a deleted layer from taking the rest with it', async () => {
    const { engine, view, pageId } = await setup()
    await commitLayers(engine, makeResult(), { pageId })

    const [, , top] = view.canvas.getObjects()
    view.canvas.remove(top)
    engine.commit(pageId, { label: 'delete layer' })

    expect(engine.state.doc.pages[0].objects).toHaveLength(2)
    expect(names(engine)).toEqual([ORIGINAL_LAYER_NAME, 'زخرفة أ'])
  })

  it('never mutates the pipeline result and never replaces the user design', async () => {
    const { engine, pageId } = await setup()
    const result = makeResult()
    const snapshot = JSON.stringify(result)

    const before = engine.state.doc.pages[0].objects.length
    await commitLayers(engine, result, { pageId })

    expect(JSON.stringify(result)).toBe(snapshot)
    // The decomposition only ADDS: existing objects stay, the page keeps its size.
    expect(engine.state.doc.pages[0].objects.length).toBe(before + 3)
    expect(engine.pageSizeOf(pageId)).toMatchObject({ width: PAGE.width, height: PAGE.height })
  })

  it('adds nothing at all in a read-only (shared view) editor', async () => {
    const handle = createMemoryAdapter()
    const engine = new EditorEngine({
      adapter: handle.adapter,
      document: createBlankDocument(PAGE.width, PAGE.height),
      meta: { id: 'd2', title: 'Shared', mode: 'shared-view' },
      ephemeral: true,
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const pageId = engine.state.doc.pages[0].id
    engine.mountPage(pageId, host)
    await engine.whenView(pageId)

    const out = await commitLayers(engine, makeResult(), { pageId })
    expect(out.added).toBe(0)
    expect(engine.state.doc.pages[0].objects).toHaveLength(0)
  })

  it('places a degenerate layer rect over the full page instead of creating a zero-sized object', () => {
    const placement = layerToPlacement(
      layer({ id: 'x', name: 'x', bounds: { x: 0, y: 0, width: 0, height: 0 }, page: { x: 0, y: 0, width: 0, height: 0 }, zIndex: 0 }),
      PAGE,
    )
    expect(placement.width).toBe(PAGE.width)
    expect(placement.height).toBe(PAGE.height)
    expect(placement.left).toBe(PAGE.width / 2)
    expect(placement.top).toBe(PAGE.height / 2)
  })
})