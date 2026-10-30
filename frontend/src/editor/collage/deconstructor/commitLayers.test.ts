import { Rect, StaticCanvas, type FabricObject } from 'fabric'
import { asDory } from '../../engine/objects/dory'
import {
  COMMIT_HISTORY_LABEL,
  ORIGINAL_LAYER_NAME,
  commitLayers,
  layerCanvasPlacement,
  layerToPlacement,
  type LayerCommitTarget,
} from './commitLayers'
import type { ExtractedLayer, PipelineResult } from './types'

/** A full layer with sensible defaults; the interesting fields are overridden per test. */
function makeLayer(id: string, zIndex: number, overrides: Partial<ExtractedLayer> = {}): ExtractedLayer {
  const base: ExtractedLayer = {
    id,
    name: id,
    layerClass: 'decoration',
    croppedDataUrl: 'data:image/png;base64,Y3JvcA==',
    fullCanvasDataUrl: 'data:image/png;base64,ZnVsbA==',
    alphaMaskDataUrl: 'data:image/png;base64,bWFzaw==',
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    page: { x: 0, y: 0, width: 1000, height: 800 },
    rotation: 0,
    opacity: 1,
    zIndex,
    confidence: 0.9,
    extractionMethod: 'classical-segmentation',
    source: { url: 'data:image/png;base64,ZnVsbA==', width: 1000, height: 800 },
    editableProperties: { movable: true, resizable: true, removable: true, textEditable: false },
  }
  return Object.assign(base, overrides)
}

function makeResult(layers: ExtractedLayer[], imageUrl: string): PipelineResult {
  return {
    status: 'ready',
    input: { imageUrl, width: 1000, height: 800, pageWidth: 1000, pageHeight: 800 },
    originalDataUrl: 'data:image/png;base64,b3JpZ2luYWw=',
    layers,
    background: { originalDataUrl: 'data:image/png;base64,b3JpZ2luYWw=', reconstructedDataUrl: null, method: null },
    compositeDataUrl: 'data:image/png;base64,Y29tcG9zaXRl',
    warnings: [],
    segmentationProviderId: 'classical',
    neural: false,
    durationMs: 12,
  }
}

/** A canvas-free object standing in for a real `createImage` result, carrying the dory name and id. */
function stubObject(layer: ExtractedLayer): FabricObject {
  const rect = new Rect({ width: Math.max(1, layer.page.width), height: Math.max(1, layer.page.height), left: 0, top: 0 })
  const d = asDory(rect)
  d.id = `obj-${layer.id}`
  d.name = layer.name
  return rect
}

function makeTarget(options: { readOnly?: boolean; addImpl?: (objects: FabricObject[]) => Promise<void> } = {}): {
  target: LayerCommitTarget
  add: ReturnType<typeof vi.fn>
  toast: ReturnType<typeof vi.fn>
  pageSizeOf: ReturnType<typeof vi.fn>
} {
  const add = vi.fn(async (_objects: FabricObject[], _label: string, _opts?: { pageId?: string }) => {
    if (options.addImpl) await options.addImpl(_objects)
  })
  const toast = vi.fn()
  const pageSizeOf = vi.fn(() => ({ width: 1000, height: 800 }))
  const target: LayerCommitTarget = {
    readOnly: options.readOnly ?? false,
    state: { activePageId: 'page-1' },
    assets: { resolve: async (src: string) => src },
    insert: { add },
    pageSizeOf,
    toast,
  }
  return { target, add, toast, pageSizeOf }
}

describe('layerToPlacement', () => {
  it('turns a top-left page rectangle into the centre Fabric rasterises back to the same rectangle', () => {
    const layer = makeLayer('l1', 0, { page: { x: 100, y: 50, width: 200, height: 100 }, rotation: 15 })
    const placement = layerToPlacement(layer, { width: 1000, height: 800 })

    expect(placement).toEqual({ left: 200, top: 100, width: 200, height: 100, angle: 15 })

    // The real proof: a Fabric object placed with these numbers occupies exactly the source rectangle.
    const rect = new Rect({
      left: placement.left,
      top: placement.top,
      width: placement.width,
      height: placement.height,
      originX: 'center',
      originY: 'center',
      strokeWidth: 0,
    })
    const box = rect.getBoundingRect()
    expect([box.left, box.top, box.width, box.height]).toEqual([100, 50, 200, 100])
  })

  it('falls back to the page box instead of creating a zero-sized placement', () => {
    const layer = makeLayer('l2', 0, { page: { x: 5, y: 7, width: 0, height: 0 } })
    expect(layerToPlacement(layer, { width: 1000, height: 800 })).toEqual({ left: 505, top: 407, width: 1000, height: 800, angle: 0 })
  })
})

describe('layerCanvasPlacement', () => {
  // A 1600x1200 source raster, an 800x600 page, and an element of 400x300 raster px shown over 200x150 page px.
  const page = { width: 800, height: 600 }
  const natural = { width: 1600, height: 1200 }

  it('lays the whole canvas over the page and lands the element centre on its page centre', () => {
    const layer = makeLayer('l1', 0, {
      bounds: { x: 100, y: 50, width: 400, height: 300 },
      page: { x: 50, y: 25, width: 200, height: 150 },
    })
    const placement = layerCanvasPlacement(layer, page, natural)

    expect(placement.scale).toBeCloseTo(0.5, 10)
    // The canvas covers the page, so its centre is the page centre.
    expect(placement.left).toBeCloseTo(400, 10)
    expect(placement.top).toBeCloseTo(300, 10)
    // The element itself sits at (boundsCentre - canvasCentre) * scale away: (150, 100) — its page centre.
    expect(placement.left + (layer.bounds.x + layer.bounds.width / 2 - natural.width / 2) * placement.scale).toBeCloseTo(150, 10)
    expect(placement.top + (layer.bounds.y + layer.bounds.height / 2 - natural.height / 2) * placement.scale).toBeCloseTo(100, 10)
  })

  it('ignores the original file size: bounds share the analysed raster, not the file', () => {
    // A 4000x3000 file reduced to a 1600x1200 raster for analysis: `layer.source` is the FILE size and must
    // not change the placement, because `bounds` and the full-canvas image are both in raster px.
    const layer = makeLayer('l2', 0, {
      bounds: { x: 100, y: 50, width: 400, height: 300 },
      page: { x: 50, y: 25, width: 200, height: 150 },
      source: { url: 'blob:big', width: 4000, height: 3000 },
    })
    const placement = layerCanvasPlacement(layer, page, natural)

    expect(placement.scale).toBeCloseTo(0.5, 10)
    expect(placement.left).toBeCloseTo(400, 10)
    expect(placement.top).toBeCloseTo(300, 10)
  })

  it('covers the page when the layer has no usable bounds', () => {
    const layer = makeLayer('l3', 0, { bounds: { x: 0, y: 0, width: 0, height: 0 }, page: { x: 5, y: 7, width: 0, height: 0 } })
    const placement = layerCanvasPlacement(layer, page, natural)
    expect(placement.scale).toBeCloseTo(0.5, 10)
    expect(placement.left).toBe(405)
    expect(placement.top).toBe(307)
  })
})

describe('commitLayers', () => {
  it('adds the original first and the layers back-to-front in ONE history step', async () => {
    const layers = [
      makeLayer('c', 2, { name: 'top' }),
      makeLayer('a', 0, { name: 'bottom' }),
      makeLayer('b', 1, { name: 'middle' }),
    ]
    const result = makeResult(layers, 'run-order')
    const { target, add, toast } = makeTarget()
    const order: string[] = []

    const outcome = await commitLayers(target, result, {
      originalObjectFactory: async () => {
        order.push(ORIGINAL_LAYER_NAME)
        return stubObject(makeLayer('orig', -1, { name: ORIGINAL_LAYER_NAME }))
      },
      objectFactory: async (layer) => {
        order.push(layer.name)
        return stubObject(layer)
      },
    })

    expect(order).toEqual([ORIGINAL_LAYER_NAME, 'bottom', 'middle', 'top'])
    expect(add).toHaveBeenCalledTimes(1)
    const [objects, label, opts] = add.mock.calls[0] as [FabricObject[], string, { pageId?: string }]
    expect(label).toBe(COMMIT_HISTORY_LABEL)
    expect(opts).toEqual({ pageId: 'page-1' })
    expect(objects.map((object) => asDory(object).name)).toEqual([ORIGINAL_LAYER_NAME, 'bottom', 'middle', 'top'])
    expect(outcome).toEqual({
      added: 4,
      pageId: 'page-1',
      objectIds: ['obj-orig', 'obj-a', 'obj-b', 'obj-c'],
    })
    expect(toast).not.toHaveBeenCalled()
  })

  it('can leave the original out and targets the requested page', async () => {
    const result = makeResult([makeLayer('a', 0, { name: 'only' })], 'run-no-original')
    const { target, add, pageSizeOf } = makeTarget()

    const outcome = await commitLayers(target, result, {
      pageId: 'page-7',
      includeOriginal: false,
      objectFactory: async (layer) => stubObject(layer),
    })

    expect(outcome).toEqual({ added: 1, pageId: 'page-7', objectIds: ['obj-a'] })
    expect(pageSizeOf).toHaveBeenCalledWith('page-7')
    const [objects, , opts] = add.mock.calls[0] as [FabricObject[], string, { pageId?: string }]
    expect(objects.map((object) => asDory(object).name)).toEqual(['only'])
    expect(opts).toEqual({ pageId: 'page-7' })
  })

  it('short-circuits a read-only editor without adding or announcing anything', async () => {
    const result = makeResult([makeLayer('a', 0)], 'run-readonly')
    const { target, add, toast } = makeTarget({ readOnly: true })
    const build = vi.fn(async (layer: ExtractedLayer) => stubObject(layer))

    const outcome = await commitLayers(target, result, { objectFactory: build })

    expect(outcome).toEqual({ added: 0, pageId: 'page-1', objectIds: [] })
    expect(build).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it('skips a layer whose image cannot be resolved, counts it and reports it', async () => {
    const result = makeResult(
      [makeLayer('a', 0, { name: 'ok-1' }), makeLayer('bad', 1, { name: 'broken' }), makeLayer('c', 2, { name: 'ok-2' })],
      'run-failing',
    )
    const { target, add, toast } = makeTarget()

    const outcome = await commitLayers(target, result, {
      includeOriginal: false,
      objectFactory: async (layer) => {
        if (layer.id === 'bad') throw new Error('data URL failed')
        return stubObject(layer)
      },
    })

    expect(outcome.added).toBe(2)
    expect(outcome.objectIds).toEqual(['obj-a', 'obj-c'])
    expect(add).toHaveBeenCalledTimes(1)
    const [objects] = add.mock.calls[0] as [FabricObject[]]
    expect(objects.map((object) => asDory(object).name)).toEqual(['ok-1', 'ok-2'])
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0]).toContain('1')
    expect(toast.mock.calls[0][1]).toBe('error')
  })

  it('adds nothing and reports it when every layer fails', async () => {
    const result = makeResult([makeLayer('bad', 0)], 'run-all-failed')
    const { target, add, toast } = makeTarget()

    const outcome = await commitLayers(target, result, {
      includeOriginal: false,
      objectFactory: async () => {
        throw new Error('no pixels')
      },
    })

    expect(outcome.added).toBe(0)
    expect(add).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('never mutates the pipeline result', async () => {
    const layers = [makeLayer('c', 2), makeLayer('a', 0), makeLayer('b', 1)]
    const result = makeResult(layers, 'run-pure')
    const before = JSON.stringify(result)
    const idsBefore = result.layers.map((layer) => layer.id)
    const { target } = makeTarget()

    await commitLayers(target, result, {
      objectFactory: async (layer) => stubObject(layer),
      originalObjectFactory: async () => stubObject(makeLayer('orig', -1, { name: ORIGINAL_LAYER_NAME })),
    })

    expect(JSON.stringify(result)).toBe(before)
    expect(result.layers.map((layer) => layer.id)).toEqual(idsBefore)
  })

  it('removes the previous run before adding when replacePrevious is set', async () => {
    const canvas = new StaticCanvas(undefined, { width: 1000, height: 800 })
    const result = makeResult([makeLayer('a', 0, { name: 'one' }), makeLayer('b', 1, { name: 'two' })], 'run-replace')
    const { target, add } = makeTarget({
      addImpl: async (objects) => {
        for (const object of objects) canvas.add(object)
      },
    })
    const builder = async (layer: ExtractedLayer): Promise<FabricObject> => stubObject(layer)

    const first = await commitLayers(target, result, { includeOriginal: false, replacePrevious: true, objectFactory: builder })
    expect(first.added).toBe(2)
    expect(canvas.getObjects()).toHaveLength(2)
    const firstObjects = canvas.getObjects().slice()

    const second = await commitLayers(target, result, { includeOriginal: false, replacePrevious: true, objectFactory: builder })
    expect(second.added).toBe(2)
    // The objects of the previous run were taken back, and the new ones were added by the same add call.
    expect(canvas.getObjects()).toHaveLength(2)
    expect(canvas.getObjects().every((object) => !firstObjects.includes(object))).toBe(true)
    expect(add).toHaveBeenCalledTimes(2)
  })
})
