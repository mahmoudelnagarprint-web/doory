/**
 * Deconstruct Studio — UI tests.
 *
 * The pipeline, the canvas commit, the exporter, the raster boundary and the provider registry are
 * mocked, so no canvas and no image decoding is involved: these tests are about what the modal shows
 * and which real function each control calls.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../../animation/testing'
import type { EditorEngine } from '../../engine/editor'
import { collageStrings } from '../../strings/collage'
import { commitLayers } from './commitLayers'
import DeconstructStudioModal from './DeconstructStudioModal'
import { downloadFiles, exportLayers } from './exportLayers'
import { runDeconstruction } from './pipeline'
import { decodeSource, imageSize, maskToDataUrl, rasterToDataUrl } from './raster'
import type { ExtractedLayer, LayerClass, PipelineOutcome, PipelineResult } from './types'

vi.mock('./pipeline', () => ({ runDeconstruction: vi.fn() }))
vi.mock('./commitLayers', () => ({ commitLayers: vi.fn() }))
vi.mock('./exportLayers', () => ({ exportLayers: vi.fn(), downloadFiles: vi.fn(), MANIFEST_FILE_NAME: 'layers.json' }))
vi.mock('./providers', () => ({ resolveInpaintProvider: vi.fn() }))
vi.mock('./raster', () => ({
  imageSize: vi.fn(),
  decodeSource: vi.fn(),
  maskToDataUrl: vi.fn(),
  rasterToDataUrl: vi.fn(),
}))

const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function layer(id: string, name: string, layerClass: LayerClass, zIndex: number): ExtractedLayer {
  return {
    id,
    name,
    layerClass,
    croppedDataUrl: DATA_URL,
    fullCanvasDataUrl: DATA_URL,
    alphaMaskDataUrl: DATA_URL,
    bounds: { x: 10, y: 10, width: 100, height: 80 },
    page: { x: 10, y: 10, width: 100, height: 80 },
    rotation: 0,
    opacity: 1,
    zIndex,
    confidence: 0.8,
    extractionMethod: 'classical-segmentation',
    source: { url: DATA_URL, width: 800, height: 600 },
    editableProperties: { movable: true, resizable: true, removable: true, textEditable: false },
  }
}

function readyResult(): PipelineResult {
  return {
    status: 'ready',
    input: { imageUrl: DATA_URL, width: 800, height: 600, pageWidth: 800, pageHeight: 600 },
    originalDataUrl: DATA_URL,
    layers: [layer('l1', 'Layer A', 'photo', 0), layer('l2', 'Layer B', 'decoration', 1)],
    background: { originalDataUrl: DATA_URL, reconstructedDataUrl: null, method: null },
    compositeDataUrl: DATA_URL,
    warnings: [],
    segmentationProviderId: 'classical-segmentation',
    neural: false,
    durationMs: 12,
  }
}

let engine: EditorEngine

beforeEach(async () => {
  engine = (await setupEditor()).engine
  vi.mocked(imageSize).mockResolvedValue({ width: 800, height: 600 })
  vi.mocked(decodeSource).mockResolvedValue({ width: 2, height: 2, data: new Uint8ClampedArray(16), originalWidth: 2, originalHeight: 2, scale: 1 })
  vi.mocked(maskToDataUrl).mockResolvedValue(DATA_URL)
  vi.mocked(rasterToDataUrl).mockResolvedValue(DATA_URL)
  vi.mocked(commitLayers).mockResolvedValue({ added: 2, pageId: 'page', objectIds: ['a', 'b'] })
  vi.mocked(exportLayers).mockResolvedValue({ files: [{ name: 'layer-01-layer-a.png', dataUrl: DATA_URL }], manifest: null })
  vi.mocked(downloadFiles).mockResolvedValue()
})

afterEach(() => {
  cleanup()
  engine.dispose()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function open(initialImageUrl: string | null = null): Promise<void> {
  await act(async () => {
    render(<DeconstructStudioModal editor={engine} initialImageUrl={initialImageUrl} pageWidth={800} pageHeight={600} onClose={() => undefined} />)
  })
}

/** Picks a source image, runs the analysis and waits for the review sections to exist. */
async function analyse(initialImageUrl: string = DATA_URL): Promise<void> {
  await open(initialImageUrl)
  await userEvent.setup().click(await screen.findByRole('button', { name: collageStrings.deconstructAnalyse }))
}

describe('DeconstructStudioModal', () => {
  it('renders the empty state and keeps analyse disabled until an image exists', async () => {
    await open()

    expect(screen.getByText(collageStrings.deconstructPreviewEmpty)).toBeTruthy()
    expect(screen.getByLabelText(collageStrings.deconstructPickFile)).toBeTruthy()
    expect(screen.getByRole('button', { name: collageStrings.deconstructAnalyse })).toBeDisabled()
    expect(screen.getByText(collageStrings.deconstructUpload)).toBeTruthy()
  })

  it('keeps the canvas source disabled and says why when no image is selected on the canvas', async () => {
    await open()

    expect(screen.getByRole('button', { name: collageStrings.deconstructFromCanvas })).toBeDisabled()
    expect(screen.getByText(collageStrings.deconstructFromCanvasReason)).toBeTruthy()
  })

  it('shows the preview with its real size and enables analyse when an image is provided', async () => {
    await open(DATA_URL)

    expect(await screen.findByAltText(collageStrings.deconstructPreview)).toBeTruthy()
    expect(screen.getByText(collageStrings.deconstructDimensions(800, 600))).toBeTruthy()
    expect(screen.getByRole('button', { name: collageStrings.deconstructAnalyse })).not.toBeDisabled()
  })

  it('reports the measured progress of a run and cancels it through the real abort signal', async () => {
    let signal: AbortSignal | undefined
    vi.mocked(runDeconstruction).mockImplementation(async (_input, options) => {
      signal = options?.signal
      options?.onProgress?.({ stage: 'segment', percent: 10, message: 'تقسيم العناصر' })
      options?.onProgress?.({ stage: 'extract', percent: 45, message: 'استخراج الطبقات' })
      // The run stays open until the test cancels it.
      return new Promise<PipelineOutcome>(() => undefined)
    })

    await analyse()

    expect(await screen.findByText(`${collageStrings.deconstructStageLabel}: ${collageStrings.deconstructStages.extract}`)).toBeTruthy()
    expect(screen.getByText(collageStrings.deconstructPercent(45))).toBeTruthy()

    await userEvent.setup().click(screen.getByRole('button', { name: collageStrings.deconstructCancel }))
    expect(signal?.aborted).toBe(true)
  })

  it('shows the real stage and message of a failure and no layer list', async () => {
    vi.mocked(runDeconstruction).mockResolvedValue({ status: 'failed', stage: 'segment', message: 'تعذّر فصل العناصر: لا يوجد محرك.', warnings: [] })

    await analyse()

    expect(await screen.findByText('تعذّر فصل العناصر: لا يوجد محرك.')).toBeTruthy()
    expect(screen.getByText(collageStrings.deconstructFailureStage(collageStrings.deconstructStages.segment))).toBeTruthy()
    expect(screen.queryByTestId('layer-list')).toBeNull()
  })

  it('explains a missing neural model distinctly', async () => {
    vi.mocked(runDeconstruction).mockResolvedValue({ status: 'model-unavailable', stage: 'segment', message: 'لا يوجد نموذج عصبي.', warnings: [] })

    await analyse()

    expect(await screen.findByText(collageStrings.deconstructModelUnavailableTitle)).toBeTruthy()
    expect(screen.getByText(collageStrings.deconstructModelUnavailableBody)).toBeTruthy()
    expect(screen.getByText(collageStrings.deconstructModelUnavailableClassical)).toBeTruthy()
  })

  it('lists the extracted layers with their names and classes and adds them to the canvas once', async () => {
    vi.mocked(runDeconstruction).mockResolvedValue(readyResult())
    vi.mocked(commitLayers).mockResolvedValue({ added: 2, pageId: engine.state.activePageId, objectIds: ['a', 'b'] })

    await analyse()

    expect(await screen.findByTestId('layer-list')).toBeTruthy()
    expect(screen.getByLabelText(collageStrings.deconstructLayerName('Layer A'))).toHaveValue('Layer A')
    expect(screen.getByTestId('layer-class-l1').textContent).toBe(collageStrings.deconstructClasses.photo)

    const add = screen.getByRole('button', { name: collageStrings.deconstructAddToCanvas })
    expect(add).not.toBeDisabled()
    await userEvent.setup().click(add)

    await waitFor(() => expect(commitLayers).toHaveBeenCalledTimes(1))
    expect(commitLayers).toHaveBeenCalledWith(engine, expect.objectContaining({ status: 'ready' }), { pageId: engine.state.activePageId, includeOriginal: true })
    expect(await screen.findByText(collageStrings.deconstructAdded(2))).toBeTruthy()
  })

  it('hides a layer from the preview and renames it from the list', async () => {
    vi.mocked(runDeconstruction).mockResolvedValue(readyResult())

    await analyse()

    expect(await screen.findByTestId('preview-box-l1')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: collageStrings.deconstructHideLayer('Layer A') }))
    expect(screen.queryByTestId('preview-box-l1')).toBeNull()
    expect(screen.getByRole('button', { name: collageStrings.deconstructShowLayer('Layer A') })).toHaveAttribute('aria-pressed', 'false')

    const input = screen.getByLabelText(collageStrings.deconstructLayerName('Layer A'))
    await userEvent.setup().clear(input)
    await userEvent.setup().type(input, 'عنوان')
    expect(screen.getByLabelText(collageStrings.deconstructLayerName('عنوان'))).toHaveValue('عنوان')
  })

  it('exports the layers with the chosen mode and then downloads the produced files', async () => {
    const files = [{ name: 'layer-01-layer-a.png', dataUrl: DATA_URL }]
    vi.mocked(runDeconstruction).mockResolvedValue(readyResult())
    vi.mocked(exportLayers).mockResolvedValue({ files, manifest: null })

    await analyse()

    await userEvent.setup().click(await screen.findByRole('button', { name: collageStrings.deconstructExportLayers }))

    await waitFor(() => expect(exportLayers).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }), expect.objectContaining({ mode: 'cropped' })))
    await waitFor(() => expect(downloadFiles).toHaveBeenCalledWith(files))
    expect(vi.mocked(exportLayers).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(downloadFiles).mock.invocationCallOrder[0])
  })

  it('opens a real assets picker that explains an empty asset folder instead of doing nothing', async () => {
    const page = { enabled: false, url: '/assets/premium_stickers/', count: 0, total: 0, truncated: false, assets: [], detail: 'LOCAL_ASSETS_DIR is not set' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } })))

    await open()
    await userEvent.setup().click(screen.getByRole('button', { name: collageStrings.deconstructFromAssets }))

    expect(await screen.findByText(collageStrings.deconstructAssetsOff)).toBeTruthy()
  })
})
