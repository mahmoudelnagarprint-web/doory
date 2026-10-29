import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '@/editor/dev/memoryAdapter'
import { EditorEngine } from '@/editor/engine/editor'
import { DEFAULT_EXPORT_OPTIONS } from '@/editor/engine/export/registry'
import { runExport } from '@/editor/engine/export/exporter'

async function engineWithComplexPage() {
  const handle = createMemoryAdapter()
  const doc = createBlankDocument(800, 600)
  doc.pages[0].objects.push(
    {
      id: 'shape-1',
      type: 'rect',
      name: 'Rect',
      left: 50,
      top: 50,
      width: 200,
      height: 100,
      fill: '#ff0000',
      visible: true,
    },
    {
      id: 'text-1',
      type: 'textbox',
      name: 'Heading',
      left: 60,
      top: 200,
      width: 400,
      height: 60,
      text: 'Hello',
      fontSize: 48,
      fontFamily: 'Inter',
      fill: '#000000',
      textAlign: 'left',
      visible: true,
    },
    {
      id: 'collage-1',
      type: 'rect',
      name: 'Slot Photo',
      left: 100,
      top: 100,
      width: 300,
      height: 200,
      fill: '#3366cc',
      collage: {
        id: 'collage-a',
        layout: 'grid',
        gap: 0,
        margin: 0,
        rtl: false,
        index: 0,
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        style: { matColor: '#ffffff', matWidth: 0, outerColor: '#ffffff', outerWidth: 0, innerColor: '#ffffff', innerWidth: 0, radius: 0 },
      },
      visible: true,
    }
  )
  const engine = new EditorEngine({ adapter: handle.adapter, document: doc, meta: { id: 'x', title: 'PSD Test', mode: 'guest' }, ephemeral: true })
  return { engine }
}

const readBlob = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as ArrayBuffer)
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(blob)
  })

describe('PSD export', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('produces layered PSD with text, group/clipping and 300 PPI', async () => {
    const { engine } = await engineWithComplexPage()
    const files = await runExport(engine, { formatId: 'psd', pages: { kind: 'all' }, options: { ...DEFAULT_EXPORT_OPTIONS, scale: 1 } })
    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('PSD-Test.psd')
    const bytes = new Uint8Array(await readBlob(files[0].blob))
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x38, 0x42, 0x50, 0x53]) // '8BPS'

    const { readPsd } = await import('ag-psd')
    const psd = await readPsd(bytes.buffer, { skipLayerImageData: true, skipCompositeImageData: true })
    const children = psd.children ?? []
    expect(children.length).toBeGreaterThanOrEqual(4)

    const hasText = children.some((l) => l.text?.text)
    expect(hasText).toBe(true)

    const groups = children.filter((l) => l.children && l.children.length > 0)
    expect(groups.length).toBeGreaterThan(0)
    const clipped = groups.find((g) => g.children?.[0]?.clipping === true)
    expect(clipped).toBeDefined()
    // The clipped picture must sit immediately above its base layer.
    expect(clipped?.children?.[1]?.clipping).toBeFalsy()

    // Every layer carries absolute, non-empty bounds inside the page.
    const layers = children.flatMap((l) => [l, ...(l.children ?? [])])
    for (const layer of layers) {
      expect(typeof layer.top).toBe('number')
      expect(typeof layer.left).toBe('number')
      expect(typeof layer.bottom).toBe('number')
      expect(typeof layer.right).toBe('number')
      expect(layer.left ?? 0).toBeGreaterThanOrEqual(0)
      expect(layer.top ?? 0).toBeGreaterThanOrEqual(0)
      expect(layer.right ?? 0).toBeLessThanOrEqual(800)
      expect(layer.bottom ?? 0).toBeLessThanOrEqual(600)
      if (layer.canvas === undefined) continue
      expect(layer.canvas?.width).toBe((layer.right ?? 0) - (layer.left ?? 0))
      expect(layer.canvas?.height).toBe((layer.bottom ?? 0) - (layer.top ?? 0))
    }

    // The page background is the bottom layer.
    const bottom = children[children.length - 1]
    expect(bottom?.name).toBe('Background')
    expect(bottom?.top).toBe(0)
    expect(bottom?.left).toBe(0)
    expect(bottom?.bottom).toBe(600)
    expect(bottom?.right).toBe(800)

    // Pixel data must be written for each layer, sized to its bounds exactly.
    const withPixels = await readPsd(bytes.buffer, { useImageData: true, skipCompositeImageData: true })
    const layersWithPixels = (withPixels.children ?? []).flatMap((l) => [l, ...(l.children ?? [])])
    const painted = layersWithPixels.filter((l) => l.imageData !== undefined)
    expect(painted.length).toBeGreaterThanOrEqual(4)
    for (const layer of painted) {
      expect(layer.imageData?.width).toBe((layer.right ?? 0) - (layer.left ?? 0))
      expect(layer.imageData?.height).toBe((layer.bottom ?? 0) - (layer.top ?? 0))
    }

    expect(psd.imageResources?.resolutionInfo?.horizontalResolution).toBe(300)
    engine.dispose()
  }, 30_000)
})
