/**
 * Deconstruct Studio — the six-section review surface for the design deconstructor.
 *
 *  1. pick a source image (upload, drag-and-drop, local assets, or an image already on the canvas)
 *  2. run the real pipeline, with its measured progress, cancellation and honest failures
 *  3. review the extracted layers (rename, hide, reorder, delete, export, two-way selection)
 *  4. correct them for real: erase/restore pixels, split connected components, merge, retype
 *  5. review the rebuilt background with a before/after divider, regenerate it, accept or reject it
 *  6. commit to the canvas, export layers / background / manifest
 *
 * Every control here calls a real function. A control whose precondition is unmet is disabled and
 * says why; nothing is faked, and a failed run never shows a result.
 *
 * Lazy-loaded by CollagePanel (`React.lazy`), so nothing in this file may be imported eagerly.
 * Type-only imports are used for the editor so the fabric chunk never enters this lazy chunk.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from 'zustand'
import type { LocalAsset } from '@/types/api'
import { asDory } from '../../engine/objects/dory'
import { useLocalAssets } from '../../hooks/useLocalAssets'
import { collageStrings } from '../../strings/collage'
import { commitLayers } from './commitLayers'
import { MANIFEST_FILE_NAME, downloadFiles, exportLayers } from './exportLayers'
import type { ExportedFile, LayerExportBundle } from './exportLayers'
import { inpaintExemplar } from './inpaint'
import { bboxOf, cutElement, maskArea, subtractMask, unionMask } from './maskOps'
import { runDeconstruction } from './pipeline'
import { resolveInpaintProvider } from './providers'
import { decodeSource, imageSize, maskToDataUrl, rasterToDataUrl } from './raster'
import { DEFAULT_DECOMPOSE_OPTIONS, decomposeRegions } from './regionSegment'
import type {
  DeconstructorOptions,
  ExtractedLayer,
  LayerClass,
  LayerExportOptions,
  PixelMask,
  PixelRect,
  PipelineFailure,
  PipelineInput,
  PipelineProgress,
  PipelineResult,
  Raster,
} from './types'
import './DeconstructStudio.css'

export interface DeconstructStudioModalProps {
  editor: ReturnType<typeof import('../../context').useEditor>
  initialImageUrl?: string | null
  pageWidth: number
  pageHeight: number
  options?: DeconstructorOptions
  onClose: () => void
}

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp'
const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** Every class the pipeline can report, in the order the type picker lists them. */
const CLASS_ORDER: readonly LayerClass[] = [
  'background', 'photo', 'person', 'frame', 'sticker', 'decoration', 'text', 'logo', 'shape', 'shadow', 'other', 'unknown',
]

/** A decode that keeps the file's own resolution (used for the small per-layer PNGs). */
const NATIVE_LONG_SIDE = 100_000

type Phase = 'idle' | 'running' | 'ready' | 'failed' | 'cancelled'
type Tool = 'none' | 'erase' | 'restore'

interface SourceImage {
  url: string
  /** Real pixel size of the file, as `imageSize` decodes it. */
  width: number
  height: number
}

/** One decoded layer, expressed in the full-canvas pixel space the layer's own PNGs already use. */
interface LayerSpace {
  full: Raster
  mask: PixelMask
  width: number
  height: number
}

/* ══════════════════════════════════════════════════════════════════════════════
 * Pure helpers
 * ══════════════════════════════════════════════════════════════════════════════ */

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Real byte length of a base64 data URL, or null when the URL carries no inline payload. */
function dataUrlBytes(url: string): number | null {
  const match = /^data:[^;,]*;base64,([\s\S]*)$/.exec(url)
  if (!match) return null
  const payload = match[1]
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding)
}

/** A rectangle of coverage, at the size of the mask it will be applied to. */
function rectMask(width: number, height: number, rect: PixelRect): PixelMask {
  const mask = new Uint8Array(width * height)
  const x0 = Math.max(0, Math.min(width, Math.round(rect.x)))
  const y0 = Math.max(0, Math.min(height, Math.round(rect.y)))
  const x1 = Math.max(x0, Math.min(width, Math.round(rect.x + rect.width)))
  const y1 = Math.max(y0, Math.min(height, Math.round(rect.y + rect.height)))
  for (let y = y0; y < y1; y++) mask.fill(255, y * width + x0, y * width + x1)
  return mask
}

/** The `bounds` window of a full-size mask (the alpha mask travels with the crop). */
function cropMaskTo(mask: PixelMask, sourceWidth: number, bounds: PixelRect): PixelMask {
  const out = new Uint8Array(Math.max(1, bounds.width) * Math.max(1, bounds.height))
  for (let y = 0; y < bounds.height; y++) {
    const rowStart = (bounds.y + y) * sourceWidth + bounds.x
    out.set(mask.subarray(rowStart, rowStart + bounds.width), y * bounds.width)
  }
  return out
}

/** A full-canvas transparent raster holding only the masked pixels of a source raster. */
function fullCanvasLayerRaster(raster: Raster, mask: PixelMask, bounds: PixelRect): Raster {
  const data = new Uint8ClampedArray(raster.width * raster.height * 4)
  for (let y = 0; y < bounds.height; y++) {
    const rowStart = (bounds.y + y) * raster.width + bounds.x
    for (let x = 0; x < bounds.width; x++) {
      const index = rowStart + x
      const coverage = mask[index]
      if (!coverage) continue
      const at = index * 4
      data[at] = raster.data[at]
      data[at + 1] = raster.data[at + 1]
      data[at + 2] = raster.data[at + 2]
      data[at + 3] = Math.round((raster.data[at + 3] * coverage) / 255)
    }
  }
  return { width: raster.width, height: raster.height, data }
}

/** ORs a smaller mask into a bigger one at (x, y), ignoring anything that falls outside. */
function placeMask(destination: PixelMask, destinationWidth: number, source: PixelMask, sourceWidth: number, sourceHeight: number, x: number, y: number): void {
  for (let row = 0; row < sourceHeight; row++) {
    const target = (y + row) * destinationWidth + x
    const start = row * sourceWidth
    for (let column = 0; column < sourceWidth; column++) {
      const value = source[start + column]
      if (value && target + column >= 0 && target + column < destination.length) {
        destination[target + column] = Math.max(destination[target + column], value)
      }
    }
  }
}

/**
 * Number of 8-connected components of a coverage mask. Real measurement, used to decide whether the
 * selected layer can actually be split — no component, no split button.
 */
function countComponents(mask: PixelMask, width: number, height: number): number {
  const seen = new Uint8Array(width * height)
  const stack = new Int32Array(width * height)
  let count = 0
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue
    count += 1
    let top = 0
    stack[top++] = start
    seen[start] = 1
    while (top > 0) {
      const index = stack[--top]
      const x = index % width
      const y = (index - x) / width
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const next = ny * width + nx
          if (seen[next] || !mask[next]) continue
          seen[next] = 1
          stack[top++] = next
        }
      }
    }
  }
  return count
}

/** Pulls the coverage mask out of a grayscale mask PNG (`maskToDataUrl` writes it in every channel). */
async function decodeMask(url: string, longSide: number): Promise<{ mask: PixelMask; width: number; height: number }> {
  const decoded = await decodeSource(url, { maxLongSide: Math.max(1, Math.ceil(longSide)) })
  const mask = new Uint8Array(decoded.width * decoded.height)
  for (let i = 0; i < mask.length; i++) mask[i] = decoded.data[i * 4]
  return { mask, width: decoded.width, height: decoded.height }
}

/** Decodes a layer's full-canvas PNG and rebuilds its full-canvas coverage mask, in one space. */
async function readLayerSpace(layer: ExtractedLayer): Promise<LayerSpace> {
  const full = await decodeSource(layer.fullCanvasDataUrl, { maxLongSide: NATIVE_LONG_SIDE })
  const local = await decodeMask(layer.alphaMaskDataUrl, Math.max(layer.bounds.width, layer.bounds.height))
  const mask = new Uint8Array(full.width * full.height)
  placeMask(mask, full.width, local.mask, local.width, local.height, Math.round(layer.bounds.x), Math.round(layer.bounds.y))
  return { full: { width: full.width, height: full.height, data: full.data }, mask, width: full.width, height: full.height }
}

/* ══════════════════════════════════════════════════════════════════════════════
 * The local-assets picker (a real picker over `useLocalAssets`)
 * ══════════════════════════════════════════════════════════════════════════════ */

function AssetsPicker({ onPick, onClose }: { onPick: (asset: LocalAsset) => void; onClose: () => void }) {
  const { assets, enabled, loading, failed, reload } = useLocalAssets()
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return assets
    return assets.filter((asset) => asset.name.toLowerCase().includes(needle) || asset.path.toLowerCase().includes(needle))
  }, [assets, query])

  return (
    <div className="deconstruct-assets" role="group" aria-label={collageStrings.deconstructAssetsTitle}>
      <div className="deconstruct-section-title">
        <span>{collageStrings.deconstructAssetsTitle}</span>
        <button type="button" className="deconstruct-icon-btn" onClick={onClose} aria-label={collageStrings.deconstructAssetsClose}>
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {enabled || loading ? (
        <input
          className="deconstruct-text"
          type="search"
          value={query}
          placeholder={collageStrings.deconstructAssetsSearch}
          aria-label={collageStrings.deconstructAssetsSearch}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}

      {loading ? (
        <p className="deconstruct-hint" role="status">
          {collageStrings.deconstructAssetsLoading}
        </p>
      ) : null}

      {!loading && failed ? (
        <div role="alert">
          <p className="deconstruct-error">{collageStrings.deconstructAssetsFailed}</p>
          <button type="button" className="deconstruct-btn wide" onClick={reload}>
            {collageStrings.deconstructAssetsRetry}
          </button>
        </div>
      ) : null}

      {!loading && !failed && !enabled ? <p className="deconstruct-hint">{collageStrings.deconstructAssetsOff}</p> : null}

      {!loading && !failed && enabled && visible.length === 0 ? (
        <p className="deconstruct-hint">{query ? collageStrings.deconstructAssetsNoMatch(query) : collageStrings.deconstructAssetsEmpty}</p>
      ) : null}

      {visible.length > 0 ? (
        <div className="deconstruct-assets-grid">
          {visible.map((asset) => (
            <button key={asset.path} type="button" className="deconstruct-asset" title={asset.path} aria-label={collageStrings.deconstructAssetsUse(asset.name)} onClick={() => onPick(asset)}>
              <img src={asset.url} alt="" loading="lazy" />
              <span>{asset.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
 * The modal
 * ══════════════════════════════════════════════════════════════════════════════ */

export default function DeconstructStudioModal({ editor, initialImageUrl, pageWidth, pageHeight, options, onClose }: DeconstructStudioModalProps) {
  /* ── 1. source ─────────────────────────────────────────────────────────── */
  const [source, setSource] = useState<SourceImage | null>(null)
  const [sourceBytes, setSourceBytes] = useState<number | null>(null)
  const [inputError, setInputError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const objectUrlRef = useRef<string | null>(null)

  /* ── 2. run ────────────────────────────────────────────────────────────── */
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<PipelineProgress | null>(null)
  const [failure, setFailure] = useState<PipelineFailure | null>(null)
  const [result, setResult] = useState<PipelineResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  /** Bumped by every run and every reset, so a late outcome can never land on a newer state. */
  const runTokenRef = useRef(0)

  /* ── 3-4. review ───────────────────────────────────────────────────────── */
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [hiddenIds, setHiddenIds] = useState<readonly string[]>([])
  const [tool, setTool] = useState<Tool>('none')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [components, setComponents] = useState<{ key: string; count: number } | null>(null)
  const [work, setWork] = useState<{ width: number; height: number } | null>(null)
  const workKeyRef = useRef<string | null>(null)

  /* ── 5. background ─────────────────────────────────────────────────────── */
  const [backgroundChoice, setBackgroundChoice] = useState<'reconstructed' | 'original'>('reconstructed')
  const [compare, setCompare] = useState(50)

  /* ── 6. results ────────────────────────────────────────────────────────── */
  const [exportMode, setExportMode] = useState<LayerExportOptions['mode']>('cropped')

  /* ── preview refs ──────────────────────────────────────────────────────── */
  const previewRef = useRef<HTMLDivElement | null>(null)
  const compareRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [marquee, setMarquee] = useState<PixelRect | null>(null)
  const compareDragRef = useRef(false)

  const layers = result?.layers ?? []
  const hasLayers = layers.length > 0
  /** The result as the user decided it: a rejected reconstruction is really gone from every export. */
  const activeResult = useMemo<PipelineResult | null>(() => {
    if (!result) return null
    if (backgroundChoice === 'reconstructed') return result
    return { ...result, background: { ...result.background, reconstructedDataUrl: null, method: null } }
  }, [result, backgroundChoice])

  /* ── the image the user has selected on the canvas ─────────────────────── */
  const selection = useStore(editor.store, (state) => state.selection)
  const canvasCandidate = useMemo(() => {
    for (const object of editor.selectedObjects()) {
      if (object.type !== 'image') continue
      const dory = asDory(object)
      if (dory.isPlaceholder === true || !dory.docSrc) continue
      return { src: dory.docSrc, assetId: dory.assetId ?? null, name: dory.name ?? null }
    }
    return null
    // `selection` is the subscription that makes a change made on the canvas show up here.
  }, [editor, selection])

  const resetRun = useCallback(() => {
    runTokenRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setPhase('idle')
    setProgress(null)
    setFailure(null)
    setResult(null)
    setSelectedIds([])
    setHiddenIds([])
    setTool('none')
    setNotice(null)
    setError(null)
    setComponents(null)
    setWork(null)
    setBackgroundChoice('reconstructed')
    workKeyRef.current = null
  }, [])

  const chooseUrl = useCallback(
    async (url: string, bytes: number | null) => {
      const stale = objectUrlRef.current
      if (stale && stale !== url) {
        objectUrlRef.current = null
        URL.revokeObjectURL(stale)
      }
      setInputError(null)
      try {
        const size = await imageSize(url)
        if (!(size.width > 0) || !(size.height > 0)) throw new Error(collageStrings.deconstructDecodeFailed)
        setSource({ url, width: size.width, height: size.height })
        setSourceBytes(bytes)
        resetRun()
      } catch (decodeError) {
        setInputError(messageOf(decodeError))
      }
    },
    [resetRun],
  )

  const takeFile = useCallback(
    (file: File) => {
      if (abortRef.current) return
      if (!ACCEPTED_MIME.has(file.type)) {
        setInputError(collageStrings.deconstructInvalidType)
        return
      }
      const previous = objectUrlRef.current
      const url = URL.createObjectURL(file)
      objectUrlRef.current = url
      if (previous) URL.revokeObjectURL(previous)
      void chooseUrl(url, file.size)
    },
    [chooseUrl],
  )

  const initialRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initialImageUrl || initialRef.current === initialImageUrl) return
    initialRef.current = initialImageUrl
    void chooseUrl(initialImageUrl, dataUrlBytes(initialImageUrl))
  }, [initialImageUrl, chooseUrl])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    [],
  )

  /* ── the full-canvas pixel space every layer shares (read, never guessed) ── */
  useEffect(() => {
    const first = result?.layers[0]
    if (!result || !first) return
    const key = `${result.originalDataUrl}|${first.fullCanvasDataUrl.length}`
    if (workKeyRef.current === key) return
    workKeyRef.current = key
    let cancelled = false
    imageSize(first.fullCanvasDataUrl).then(
      (size) => {
        if (!cancelled) setWork(size)
      },
      () => {
        if (!cancelled) setWork(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [result])

  const clearSource = useCallback(() => {
    const previous = objectUrlRef.current
    objectUrlRef.current = null
    if (previous) URL.revokeObjectURL(previous)
    initialRef.current = initialImageUrl ?? null
    setSource(null)
    setSourceBytes(null)
    setInputError(null)
    resetRun()
  }, [initialImageUrl, resetRun])

  /* ── 2. analyse ────────────────────────────────────────────────────────── */
  const analyse = useCallback(async () => {
    if (!source) return
    const controller = new AbortController()
    const token = runTokenRef.current + 1
    runTokenRef.current = token
    abortRef.current = controller
    setPhase('running')
    setProgress(null)
    setFailure(null)
    setResult(null)
    setError(null)
    setNotice(null)
    setSelectedIds([])
    setHiddenIds([])
    setWork(null)
    workKeyRef.current = null

    const input: PipelineInput = { imageUrl: source.url, width: source.width, height: source.height, pageWidth, pageHeight }
    try {
      const outcome = await runDeconstruction(input, {
        signal: controller.signal,
        onProgress: (update) => setProgress(update),
        // The one legacy option with a real counterpart in the new pipeline.
        detectText: options?.useTextDetection !== false,
      })
      if (runTokenRef.current !== token) return
      if (outcome.status === 'ready') {
        setResult(outcome)
        setPhase('ready')
        setProgress({ stage: 'ready', percent: 100, message: '' })
      } else {
        setResult(null)
        setFailure(outcome)
        setPhase(outcome.status === 'cancelled' ? 'cancelled' : 'failed')
      }
    } catch (runError) {
      if (runTokenRef.current !== token) return
      if (controller.signal.aborted) {
        setPhase('cancelled')
        setFailure({ status: 'cancelled', stage: 'validate', message: collageStrings.deconstructCancelled, warnings: [] })
      } else {
        setPhase('failed')
        setFailure({ status: 'failed', stage: 'validate', message: messageOf(runError), warnings: [] })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [source, pageWidth, pageHeight, options])

  const cancelRun = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /* ── 3. layer list ─────────────────────────────────────────────────────── */
  const updateLayer = useCallback((id: string, patch: Partial<ExtractedLayer>) => {
    setResult((current) => (current ? { ...current, layers: current.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)) } : current))
  }, [])

  const selectOnly = useCallback((id: string) => {
    setSelectedIds([id])
    setTool('none')
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))
  }, [])

  const removeLayer = useCallback((id: string) => {
    setResult((current) => (current ? { ...current, layers: current.layers.filter((layer) => layer.id !== id) } : current))
    setSelectedIds((current) => current.filter((entry) => entry !== id))
    setHiddenIds((current) => current.filter((entry) => entry !== id))
  }, [])

  const moveLayer = useCallback((id: string, direction: -1 | 1) => {
    setResult((current) => {
      if (!current) return current
      const order = [...current.layers].sort((a, b) => a.zIndex - b.zIndex).map((layer) => layer.id)
      const from = order.indexOf(id)
      const to = from + direction
      if (from < 0 || to < 0 || to >= order.length) return current
      const swapped = [...order]
      const held = swapped[from]
      swapped[from] = swapped[to]
      swapped[to] = held
      return { ...current, layers: current.layers.map((layer) => ({ ...layer, zIndex: swapped.indexOf(layer.id) })) }
    })
  }, [])

  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))
  }, [])

  const changeClass = useCallback(
    (id: string, layerClass: LayerClass) => {
      updateLayer(id, { layerClass })
    },
    [updateLayer],
  )

  /** The single selected layer the correction tools act on. */
  const toolLayer = useMemo(() => (selectedIds.length === 1 ? layers.find((layer) => layer.id === selectedIds[0]) ?? null : null), [layers, selectedIds])

  /** Real component count of the selected layer's mask — the honest basis for the split button. */
  const componentKey = toolLayer ? `${toolLayer.id}|${toolLayer.alphaMaskDataUrl.length}|${toolLayer.bounds.width}x${toolLayer.bounds.height}` : null
  useEffect(() => {
    if (!toolLayer || !componentKey) return
    let cancelled = false
    decodeMask(toolLayer.alphaMaskDataUrl, Math.max(toolLayer.bounds.width, toolLayer.bounds.height)).then(
      (decoded) => {
        if (!cancelled) setComponents({ key: componentKey, count: countComponents(decoded.mask, decoded.width, decoded.height) })
      },
      () => {
        if (!cancelled) setComponents(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [toolLayer, componentKey])

  const canSplit = Boolean(components && componentKey && components.key === componentKey && components.count >= 2)
  const splitReason = !toolLayer
    ? collageStrings.deconstructSplitNeedsOne
    : components && componentKey && components.key === componentKey
      ? components.count >= 2
        ? null
        : collageStrings.deconstructSplitSingle
      : collageStrings.deconstructToolNeedsOne
  const mergeReason = selectedIds.length >= 2 ? null : collageStrings.deconstructMergeNeedsTwo
  const toolReason = toolLayer ? null : collageStrings.deconstructToolNeedsOne

  /* ── 4. corrections ────────────────────────────────────────────────────── */

  /** Erase / restore a dragged rectangle: real mask maths, real re-encode, real new pixels. */
  const applyRect = useCallback(
    async (rect: PixelRect) => {
      if (!toolLayer || !result || tool === 'none' || work === null) return
      setBusy('rect')
      setError(null)
      setNotice(null)
      try {
        const space = await readLayerSpace(toolLayer)
        const area = rectMask(space.width, space.height, rect)
        const next = tool === 'erase' ? subtractMask(space.mask, area) : unionMask(space.mask, area)
        const bounds = bboxOf(next, space.width, space.height)
        if (!bounds || maskArea(next) === 0) {
          setNotice(collageStrings.deconstructToolEmptyRect)
          return
        }
        const cropped = cutElement(space.full, next, bounds)
        const fullRaster = fullCanvasLayerRaster(space.full, next, bounds)
        const [croppedDataUrl, fullCanvasDataUrl, alphaMaskDataUrl] = await Promise.all([
          rasterToDataUrl(cropped),
          rasterToDataUrl(fullRaster),
          maskToDataUrl(cropMaskTo(next, space.width, bounds), bounds.width, bounds.height),
        ])
        updateLayer(toolLayer.id, { bounds, croppedDataUrl, fullCanvasDataUrl, alphaMaskDataUrl })
        setNotice(collageStrings.deconstructToolApplied)
      } catch (editError) {
        setError(messageOf(editError))
      } finally {
        setBusy(null)
      }
    },
    [tool, toolLayer, result, work, updateLayer],
  )

  /** Split into the real regions of the layer's mask; refuses when there is only one component. */
  const splitLayer = useCallback(async () => {
    if (!toolLayer || !result) return
    setBusy('split')
    setError(null)
    setNotice(null)
    try {
      const space = await readLayerSpace(toolLayer)
      const regions = decomposeRegions(space.full, space.mask, { ...DEFAULT_DECOMPOSE_OPTIONS, minPixels: Math.max(16, Math.round(maskArea(space.mask) * 0.01)) })
      if (regions.length < 2) {
        setNotice(collageStrings.deconstructSplitSingle)
        return
      }
      const pieces: ExtractedLayer[] = []
      for (let index = 0; index < regions.length; index++) {
        const region = regions[index]
        const bounds = region.bounds
        const cropped = cutElement(space.full, region.mask, bounds)
        const fullRaster = fullCanvasLayerRaster(space.full, region.mask, bounds)
        const [croppedDataUrl, fullCanvasDataUrl, alphaMaskDataUrl] = await Promise.all([
          rasterToDataUrl(cropped),
          rasterToDataUrl(fullRaster),
          maskToDataUrl(cropMaskTo(region.mask, space.width, bounds), bounds.width, bounds.height),
        ])
        pieces.push({
          ...toolLayer,
          id: `${toolLayer.id}-${index + 1}`,
          name: `${toolLayer.name} ${index + 1}`,
          bounds,
          zIndex: toolLayer.zIndex + index,
          confidence: region.confidence,
          croppedDataUrl,
          fullCanvasDataUrl,
          alphaMaskDataUrl,
        })
      }
      setResult((current) => (current ? { ...current, layers: [...current.layers.filter((layer) => layer.id !== toolLayer.id), ...pieces] } : current))
      setSelectedIds(pieces.map((piece) => piece.id))
      setNotice(collageStrings.deconstructSplitDone(pieces.length))
    } catch (splitError) {
      setError(messageOf(splitError))
    } finally {
      setBusy(null)
    }
  }, [toolLayer, result])

  /** Merge the selected layers into one, keeping the top-most layer's class and order. */
  const mergeLayers = useCallback(async () => {
    if (!activeResult || selectedIds.length < 2) return
    const chosen = activeResult.layers.filter((layer) => selectedIds.includes(layer.id)).sort((a, b) => a.zIndex - b.zIndex)
    if (chosen.length < 2) {
      setNotice(collageStrings.deconstructMergeNeedsTwo)
      return
    }
    setBusy('merge')
    setError(null)
    setNotice(null)
    try {
      const spaces = await Promise.all(chosen.map((layer) => readLayerSpace(layer)))
      const width = Math.max(...spaces.map((space) => space.width))
      const height = Math.max(...spaces.map((space) => space.height))
      const mask = new Uint8Array(width * height)
      const data = new Uint8ClampedArray(width * height * 4)
      for (const space of spaces) {
        for (let index = 0; index < space.mask.length; index++) {
          const coverage = space.mask[index]
          if (!coverage) continue
          mask[index] = Math.max(mask[index], coverage)
          const at = index * 4
          data[at] = space.full.data[at]
          data[at + 1] = space.full.data[at + 1]
          data[at + 2] = space.full.data[at + 2]
          data[at + 3] = Math.round((space.full.data[at + 3] * coverage) / 255)
        }
      }
      const bounds = bboxOf(mask, width, height)
      if (!bounds) {
        setNotice(collageStrings.deconstructToolEmptyRect)
        return
      }
      const mergedRaster: Raster = { width, height, data }
      const merged = chosen[chosen.length - 1]
      const cropped = cutElement(mergedRaster, mask, bounds)
      const [croppedDataUrl, fullCanvasDataUrl, alphaMaskDataUrl] = await Promise.all([
        rasterToDataUrl(cropped),
        rasterToDataUrl(mergedRaster),
        maskToDataUrl(cropMaskTo(mask, width, bounds), bounds.width, bounds.height),
      ])
      const combined: ExtractedLayer = {
        ...merged,
        id: `${merged.id}-merged`,
        name: chosen.map((layer) => layer.name).join(' + '),
        layerClass: merged.layerClass,
        bounds,
        zIndex: Math.max(...chosen.map((layer) => layer.zIndex)),
        confidence: chosen.reduce((sum, layer) => sum + layer.confidence, 0) / chosen.length,
        croppedDataUrl,
        fullCanvasDataUrl,
        alphaMaskDataUrl,
      }
      const removed = new Set(chosen.map((layer) => layer.id))
      setResult((current) => (current ? { ...current, layers: [...current.layers.filter((layer) => !removed.has(layer.id)), combined] } : current))
      setSelectedIds([combined.id])
      setNotice(collageStrings.deconstructMergeDone(chosen.length))
    } catch (mergeError) {
      setError(messageOf(mergeError))
    } finally {
      setBusy(null)
    }
  }, [activeResult, selectedIds])

  /** Re-run the pipeline over the same source, replacing the review state (confirmation required). */
  const extractAgain = useCallback(async () => {
    if (!source) return
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(collageStrings.deconstructExtractConfirm)) return
    await analyse()
  }, [source, analyse])

  /* ── 5. background ─────────────────────────────────────────────────────── */

  /** Rebuilds the background from real surroundings: union of every layer mask, real inpaint pass. */
  const regenerateBackground = useCallback(async () => {
    if (!result) return
    if (result.layers.length === 0) {
      setNotice(collageStrings.deconstructRegenerateNeedsLayers)
      return
    }
    setBusy('background')
    setError(null)
    setNotice(null)
    try {
      // The pipeline's own decode rule, so the masks line up with the analysis raster pixel for pixel.
      const base = await decodeSource(result.originalDataUrl, {})
      const mask = new Uint8Array(base.width * base.height)
      for (const layer of result.layers) {
        const local = await decodeMask(layer.alphaMaskDataUrl, Math.max(layer.bounds.width, layer.bounds.height))
        placeMask(mask, base.width, local.mask, local.width, local.height, Math.round(layer.bounds.x), Math.round(layer.bounds.y))
      }
      if (maskArea(mask) === 0) {
        setNotice(collageStrings.deconstructRegenerateNeedsLayers)
        return
      }
      const provider = await resolveInpaintProvider()
      const filled = inpaintExemplar({ width: base.width, height: base.height, data: base.data }, mask)
      const reconstructedDataUrl = await rasterToDataUrl(filled)
      setResult((current) => (current ? { ...current, background: { ...current.background, reconstructedDataUrl, method: provider.id } } : current))
      setBackgroundChoice('reconstructed')
      setNotice(collageStrings.deconstructRegenerateDone)
    } catch (inpaintError) {
      setError(`${collageStrings.deconstructNoInpaintProvider} ${messageOf(inpaintError)}`)
    } finally {
      setBusy(null)
    }
  }, [result])

  /* ── 6. results ────────────────────────────────────────────────────────── */
  const commitToCanvas = useCallback(async () => {
    if (!activeResult || !hasLayers) return
    setBusy('commit')
    setError(null)
    setNotice(null)
    try {
      const committed = await commitLayers(editor, activeResult, { pageId: editor.state.activePageId, includeOriginal: true })
      setNotice(collageStrings.deconstructAdded(committed.added))
      editor.toast(collageStrings.deconstructAdded(committed.added), 'success')
    } catch (commitError) {
      const message = `${collageStrings.deconstructToastError} ${messageOf(commitError)}`
      setError(message)
      editor.toast(message, 'error')
    } finally {
      setBusy(null)
    }
  }, [activeResult, editor, hasLayers])

  const runExport = useCallback(
    async (target: PipelineResult, label: string, exportOptions: LayerExportOptions, pick: (bundle: LayerExportBundle) => ExportedFile[]) => {
      const bundle = await exportLayers(target, exportOptions)
      const files = pick(bundle)
      if (files.length === 0) {
        setNotice(collageStrings.deconstructExportEmpty)
        return
      }
      await downloadFiles(files)
      setNotice(`${label}: ${collageStrings.deconstructExported(files.length)}`)
    },
    [],
  )

  const exportAllLayers = useCallback(async () => {
    if (!activeResult || !hasLayers) {
      setNotice(collageStrings.deconstructExportNeedsLayers)
      return
    }
    setBusy('export')
    setError(null)
    setNotice(null)
    try {
      await runExport(activeResult, collageStrings.deconstructExportLayers, { mode: exportMode, includeBackground: false, includeManifest: false }, (bundle) => bundle.files)
    } catch (exportError) {
      setError(messageOf(exportError))
    } finally {
      setBusy(null)
    }
  }, [activeResult, exportMode, hasLayers, runExport])

  const exportOneLayer = useCallback(
    async (layer: ExtractedLayer) => {
      if (!activeResult) return
      setBusy('export')
      setError(null)
      setNotice(null)
      try {
        await runExport(activeResult, collageStrings.deconstructExportLayer(layer.name), { mode: 'cropped', includeBackground: false, includeManifest: true }, (bundle) => {
          const entry = bundle.manifest?.layers.find((item) => item.id === layer.id)
          const file = entry ? bundle.files.find((item) => item.name === entry.file) : undefined
          return file ? [file] : []
        })
      } catch (exportError) {
        setError(messageOf(exportError))
      } finally {
        setBusy(null)
      }
    },
    [activeResult, runExport],
  )

  const exportBackground = useCallback(async () => {
    if (!activeResult) {
      setNotice(collageStrings.deconstructExportBackgroundNeeds)
      return
    }
    setBusy('export')
    setError(null)
    setNotice(null)
    try {
      const bundle = await exportLayers(activeResult, { mode: 'full-canvas', includeBackground: true, includeManifest: true })
      const names = new Set([bundle.manifest?.background.file ?? null, bundle.manifest?.background.reconstructedFile ?? null].filter((name): name is string => Boolean(name)))
      const files = bundle.files.filter((file) => names.has(file.name))
      if (files.length === 0) {
        setNotice(collageStrings.deconstructExportBackgroundNeeds)
        return
      }
      await downloadFiles(files)
      setNotice(`${collageStrings.deconstructExportBackground}: ${collageStrings.deconstructExported(files.length)}`)
    } catch (exportError) {
      setError(messageOf(exportError))
    } finally {
      setBusy(null)
    }
  }, [activeResult])

  const exportManifest = useCallback(async () => {
    if (!activeResult) {
      setNotice(collageStrings.deconstructExportManifestNeeds)
      return
    }
    setBusy('export')
    setError(null)
    setNotice(null)
    try {
      const bundle = await exportLayers(activeResult, { mode: exportMode, includeBackground: false, includeManifest: true })
      const file = bundle.files.find((entry) => entry.name === MANIFEST_FILE_NAME)
      if (!file) {
        setNotice(collageStrings.deconstructExportEmpty)
        return
      }
      await downloadFiles([file])
      setNotice(`${collageStrings.deconstructExportManifest}: ${collageStrings.deconstructExported(1)}`)
    } catch (exportError) {
      setError(messageOf(exportError))
    } finally {
      setBusy(null)
    }
  }, [activeResult, exportMode])

  const pickFromAssets = useCallback(
    (asset: LocalAsset) => {
      setAssetsOpen(false)
      void chooseUrl(asset.url, asset.size > 0 ? asset.size : null)
    },
    [chooseUrl],
  )

  const pickFromCanvas = useCallback(async () => {
    if (!canvasCandidate) return
    setInputError(null)
    try {
      const url = await editor.assets.resolve(canvasCandidate.src)
      await chooseUrl(url, dataUrlBytes(url))
    } catch (resolveError) {
      setInputError(`${collageStrings.deconstructFromCanvasNoSrc} ${messageOf(resolveError)}`)
    }
  }, [canvasCandidate, chooseUrl, editor])

  /* ── pointer interaction on the preview ────────────────────────────────── */
  const pointerToImage = useCallback(
    (event: { clientX: number; clientY: number }): { x: number; y: number } | null => {
      const element = previewRef.current
      if (!element || !work) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: ((event.clientX - rect.left) / rect.width) * work.width, y: ((event.clientY - rect.top) / rect.height) * work.height }
    },
    [work],
  )

  const onPreviewDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (tool === 'none' || !toolLayer) return
      if ((event.target as HTMLElement).closest('.deconstruct-box')) return
      const point = pointerToImage(event)
      if (!point) return
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        // Pointer capture is an enhancement: the drag still tracks without it.
      }
      dragRef.current = { x0: point.x, y0: point.y, x1: point.x, y1: point.y }
      setMarquee({ x: point.x, y: point.y, width: 0, height: 0 })
    },
    [tool, toolLayer, pointerToImage],
  )

  const onPreviewMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const point = pointerToImage(event)
      if (!point) return
      drag.x1 = point.x
      drag.y1 = point.y
      setMarquee({ x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) })
    },
    [pointerToImage],
  )

  const onPreviewUp = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    setMarquee(null)
    if (!drag) return
    const rect: PixelRect = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }
    if (rect.width < 1 || rect.height < 1) {
      setNotice(collageStrings.deconstructToolEmptyRect)
      return
    }
    void applyRect(rect)
  }, [applyRect])

  const setCompareFromEvent = useCallback((clientX: number) => {
    const element = compareRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0) return
    const percent = Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 100)
    setCompare(percent)
  }, [])

  /* ── derived view state ────────────────────────────────────────────────── */
  const orderedLayers = useMemo(() => [...layers].sort((a, b) => b.zIndex - a.zIndex), [layers])
  const previewAspect = work ?? (source ? { width: source.width, height: source.height } : null)
  const percent = progress ? Math.max(0, Math.min(100, progress.percent)) : 0
  const running = phase === 'running'
  const reached = result ? 6 : source ? 2 : 1
  const steps: { id: number; label: string }[] = [
    { id: 1, label: collageStrings.deconstructStepImage },
    { id: 2, label: collageStrings.deconstructStepAnalyse },
    { id: 3, label: collageStrings.deconstructStepLayers },
    { id: 4, label: collageStrings.deconstructStepTools },
    { id: 5, label: collageStrings.deconstructStepBackground },
    { id: 6, label: collageStrings.deconstructStepResults },
  ]

  const analyseDisabledReason = !source ? collageStrings.deconstructUpload : running ? collageStrings.deconstructAnalysing : null
  const stop = (action: () => void) => (event: ReactMouseEvent) => {
    event.stopPropagation()
    action()
  }

  return (
    <section className="deconstruct-studio" role="dialog" aria-modal="true" aria-labelledby="deconstruct-title">
      <header className="deconstruct-header">
        <div className="deconstruct-header-row">
          <div>
            <h2 className="deconstruct-title" id="deconstruct-title">
              {collageStrings.deconstructTitle}
            </h2>
            <p className="deconstruct-intro">{collageStrings.deconstructIntro}</p>
          </div>
          <button type="button" className="deconstruct-close-btn" onClick={onClose} aria-label={collageStrings.deconstructClose}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="deconstruct-steps">
          {steps.map((step) => (
            <span key={step.id} className="deconstruct-step" data-state={step.id < reached ? 'done' : step.id === reached ? 'active' : 'todo'} aria-current={step.id === reached ? 'step' : undefined}>
              {step.label}
            </span>
          ))}
        </div>
      </header>

      <div className="deconstruct-body">
        {/* ── stage: the source preview and the before/after comparison ────── */}
        <div className="deconstruct-stage">
          {source ? (
            <>
              <div
                className="deconstruct-preview"
                ref={previewRef}
                data-tool={tool}
                style={previewAspect ? { aspectRatio: `${previewAspect.width} / ${previewAspect.height}` } : undefined}
                onPointerDown={onPreviewDown}
                onPointerMove={onPreviewMove}
                onPointerUp={onPreviewUp}
                onPointerCancel={onPreviewUp}
              >
                <img className="deconstruct-preview-img" src={source.url} alt={collageStrings.deconstructPreview} draggable={false} onDragStart={(event) => event.preventDefault()} />
                {work && result
                  ? result.layers
                      .filter((layer) => !hiddenIds.includes(layer.id))
                      .map((layer) => {
                        const isSelected = selectedIds.includes(layer.id)
                        return (
                          <button
                            key={layer.id}
                            type="button"
                            className="deconstruct-box"
                            data-testid={`preview-box-${layer.id}`}
                            data-selected={isSelected ? 'true' : undefined}
                            style={{
                              left: `${(layer.bounds.x / work.width) * 100}%`,
                              top: `${(layer.bounds.y / work.height) * 100}%`,
                              width: `${(layer.bounds.width / work.width) * 100}%`,
                              height: `${(layer.bounds.height / work.height) * 100}%`,
                            }}
                            aria-label={collageStrings.deconstructSelectLayer(layer.name)}
                            aria-pressed={isSelected}
                            onClick={() => selectOnly(layer.id)}
                          />
                        )
                      })
                  : null}
                {marquee && work ? (
                  <span
                    className="deconstruct-marquee"
                    style={{
                      left: `${(marquee.x / work.width) * 100}%`,
                      top: `${(marquee.y / work.height) * 100}%`,
                      width: `${(marquee.width / work.width) * 100}%`,
                      height: `${(marquee.height / work.height) * 100}%`,
                    }}
                  />
                ) : null}
              </div>
              <div className="deconstruct-preview-meta">
                <span>{collageStrings.deconstructDimensions(source.width, source.height)}</span>
                <span>{sourceBytes === null ? collageStrings.deconstructSizeUnknown : collageStrings.deconstructFileSize(formatBytes(sourceBytes))}</span>
                {sourceBytes === null ? <span>{collageStrings.deconstructSizeUnknownReason}</span> : null}
              </div>
            </>
          ) : (
            <p className="deconstruct-preview-empty">{collageStrings.deconstructPreviewEmpty}</p>
          )}

          {result?.background.reconstructedDataUrl ? (
            <div className="deconstruct-compare-wrap">
              <div
                className="deconstruct-compare"
                ref={compareRef}
                style={previewAspect ? { aspectRatio: `${previewAspect.width} / ${previewAspect.height}` } : undefined}
                onPointerDown={(event) => {
                  compareDragRef.current = true
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setCompareFromEvent(event.clientX)
                }}
                onPointerMove={(event) => {
                  if (compareDragRef.current) setCompareFromEvent(event.clientX)
                }}
                onPointerUp={() => {
                  compareDragRef.current = false
                }}
                onPointerCancel={() => {
                  compareDragRef.current = false
                }}
              >
                <img className="deconstruct-compare-img" src={result.background.originalDataUrl} alt={collageStrings.deconstructOriginal} draggable={false} />
                <img
                  className="deconstruct-compare-img deconstruct-compare-after"
                  src={result.background.reconstructedDataUrl}
                  alt={collageStrings.deconstructReconstructed}
                  draggable={false}
                  style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}
                />
                <span className="deconstruct-compare-tag before">{collageStrings.deconstructBefore}</span>
                <span className="deconstruct-compare-tag after">{collageStrings.deconstructAfter}</span>
                <span className="deconstruct-compare-line" style={{ left: `${compare}%` }} />
              </div>
              <input
                className="deconstruct-compare-range"
                type="range"
                min={0}
                max={100}
                value={compare}
                aria-label={collageStrings.deconstructCompare}
                onChange={(event) => setCompare(Number(event.target.value))}
              />
              <span className="deconstruct-hint">
                {collageStrings.deconstructCompare}: {collageStrings.deconstructCompareValue(compare)}
              </span>
            </div>
          ) : result ? (
            <p className="deconstruct-hint">{collageStrings.deconstructNoReconstruction}</p>
          ) : null}
        </div>

        {/* ── control panel: the six sections ──────────────────────────────── */}
        <div className="deconstruct-panel">
          {/* 1 — image input */}
          <section className="deconstruct-section" aria-labelledby="deconstruct-section-image">
            <h3 className="deconstruct-section-title" id="deconstruct-section-image">
              {collageStrings.deconstructStepImage}
            </h3>
            <div
              className="deconstruct-drop"
              data-dragging={dragging ? 'true' : undefined}
              onDragOver={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault()
                setDragging(false)
                const file = event.dataTransfer.files[0]
                if (file) takeFile(file)
              }}
            >
              <label className="deconstruct-btn" htmlFor="deconstruct-file-input" aria-disabled={running}>
                {collageStrings.deconstructPickFile}
              </label>
              <input
                id="deconstruct-file-input"
                className="deconstruct-input-source"
                type="file"
                accept={ACCEPTED_TYPES}
                disabled={running}
                aria-label={collageStrings.deconstructPickFile}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const file = event.target.files?.[0]
                  if (file) takeFile(file)
                  event.target.value = ''
                }}
              />
              <p className="deconstruct-hint">{collageStrings.deconstructDropHint}</p>
            </div>

            <div className="deconstruct-btn-row">
              <button type="button" className="deconstruct-btn" aria-expanded={assetsOpen} disabled={running} onClick={() => setAssetsOpen((open) => !open)}>
                {collageStrings.deconstructFromAssets}
              </button>
              <button
                type="button"
                className="deconstruct-btn"
                disabled={running || !canvasCandidate}
                title={canvasCandidate ? canvasCandidate.name ?? canvasCandidate.assetId ?? undefined : collageStrings.deconstructFromCanvasReason}
                onClick={() => void pickFromCanvas()}
              >
                {collageStrings.deconstructFromCanvas}
              </button>
            </div>
            {!canvasCandidate ? <p className="deconstruct-hint">{collageStrings.deconstructFromCanvasReason}</p> : null}
            {source ? (
              <button type="button" className="deconstruct-btn wide" disabled={running} onClick={clearSource}>
                {collageStrings.deconstructClearImage}
              </button>
            ) : null}
            {assetsOpen ? <AssetsPicker onPick={pickFromAssets} onClose={() => setAssetsOpen(false)} /> : null}
            {inputError ? (
              <p className="deconstruct-error" role="alert">
                {inputError}
              </p>
            ) : null}
          </section>

          {/* 2 — analyse */}
          <section className="deconstruct-section" aria-labelledby="deconstruct-section-analyse">
            <h3 className="deconstruct-section-title" id="deconstruct-section-analyse">
              {collageStrings.deconstructStepAnalyse}
            </h3>
            {running ? (
              <div className="deconstruct-progress" role="status" aria-live="polite">
                <p className="deconstruct-hint">
                  {`${collageStrings.deconstructStageLabel}: ${collageStrings.deconstructStages[progress?.stage ?? 'validate']}`}
                </p>
                <div className="deconstruct-progress-bar">
                  <div className="deconstruct-progress-fill" style={{ width: `${percent}%` }} />
                </div>
                <div className="deconstruct-progress-row">
                  <span>{progress?.message ?? collageStrings.deconstructAnalysing}</span>
                  <span>{collageStrings.deconstructPercent(percent)}</span>
                </div>
                <button type="button" className="deconstruct-btn danger wide" onClick={cancelRun}>
                  {collageStrings.deconstructCancel}
                </button>
              </div>
            ) : (
              <>
                <button type="button" className="deconstruct-btn primary wide" disabled={!source || running} onClick={() => void analyse()}>
                  {collageStrings.deconstructAnalyse}
                </button>
                {analyseDisabledReason ? <p className="deconstruct-hint">{analyseDisabledReason}</p> : null}
                {(phase === 'failed' || phase === 'cancelled') && source ? (
                  <button type="button" className="deconstruct-btn wide" onClick={() => void analyse()}>
                    {collageStrings.deconstructRetry}
                  </button>
                ) : null}
              </>
            )}

            {phase === 'cancelled' ? (
              <p className="deconstruct-notice" role="status">
                {collageStrings.deconstructCancelled}
              </p>
            ) : null}

            {phase === 'failed' && failure ? (
              <div className="deconstruct-error" role="alert">
                {failure.status === 'model-unavailable' ? (
                  <>
                    <strong>{collageStrings.deconstructModelUnavailableTitle}</strong>
                    <p>{collageStrings.deconstructModelUnavailableBody}</p>
                    <p>{collageStrings.deconstructModelUnavailableClassical}</p>
                  </>
                ) : (
                  <strong>{collageStrings.deconstructFailureTitle}</strong>
                )}
                <p>{collageStrings.deconstructFailureStage(collageStrings.deconstructStages[failure.stage])}</p>
                <p>{failure.message}</p>
              </div>
            ) : null}

            {phase === 'failed' ? <p className="deconstruct-hint">{collageStrings.deconstructFailureNoLayers}</p> : null}

            {result && result.warnings.length > 0 ? (
              <div className="deconstruct-warning">
                {result.warnings.some((warning) => warning.code === 'model-unavailable' || warning.code === 'classical-fallback') ? (
                  <>
                    <strong>{collageStrings.deconstructModelUnavailableTitle}</strong>
                    <p>{collageStrings.deconstructModelUnavailableBody}</p>
                  </>
                ) : null}
                <ul>
                  {result.warnings.map((warning) => (
                    <li key={`${warning.code}:${warning.message}`}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* 3 — layer list */}
          {phase === 'ready' && result ? (
            <section className="deconstruct-section" aria-labelledby="deconstruct-section-layers" data-testid="layer-list">
              <h3 className="deconstruct-section-title" id="deconstruct-section-layers">
                <span>{collageStrings.deconstructLayers}</span>
                <span className="deconstruct-badge">{collageStrings.deconstructLayerCount(layers.length)}</span>
              </h3>
              {!hasLayers ? (
                <p className="deconstruct-hint">{collageStrings.deconstructNoLayers}</p>
              ) : (
                <ul className="deconstruct-layers">
                  {orderedLayers.map((layer) => {
                    const isSelected = selectedIds.includes(layer.id)
                    const isHidden = hiddenIds.includes(layer.id)
                    return (
                      <li key={layer.id} className="deconstruct-layer" data-selected={isSelected ? 'true' : undefined} onClick={() => selectOnly(layer.id)}>
                        <img className="deconstruct-layer-thumb" src={layer.croppedDataUrl} alt="" />
                        <div className="deconstruct-layer-main">
                          <input
                            className="deconstruct-layer-name"
                            type="text"
                            value={layer.name}
                            aria-label={collageStrings.deconstructLayerName(layer.name)}
                            onChange={(event) => updateLayer(layer.id, { name: event.target.value })}
                          />
                          <div className="deconstruct-layer-meta">
                            <span className="deconstruct-badge" data-testid={`layer-class-${layer.id}`}>
                              {collageStrings.deconstructClasses[layer.layerClass]}
                            </span>
                            <span className="deconstruct-conf">{collageStrings.deconstructConfidence(Math.round(layer.confidence * 100))}</span>
                            <span className="deconstruct-method">{collageStrings.deconstructMethods[layer.extractionMethod]}</span>
                          </div>
                          <label className="deconstruct-field">
                            <span>{collageStrings.deconstructChangeType}</span>
                            <select
                              className="deconstruct-select"
                              value={layer.layerClass}
                              aria-label={collageStrings.deconstructChangeTypeFor(layer.name)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => changeClass(layer.id, event.target.value as LayerClass)}
                            >
                              {CLASS_ORDER.map((layerClass) => (
                                <option key={layerClass} value={layerClass}>
                                  {collageStrings.deconstructClasses[layerClass]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="deconstruct-layer-actions">
                            <button
                              type="button"
                              className="deconstruct-icon-btn"
                              aria-label={isHidden ? collageStrings.deconstructShowLayer(layer.name) : collageStrings.deconstructHideLayer(layer.name)}
                              aria-pressed={!isHidden}
                              onClick={stop(() => toggleHidden(layer.id))}
                            >
                              <span aria-hidden="true">{isHidden ? '○' : '◉'}</span>
                            </button>
                            <button
                              type="button"
                              className="deconstruct-icon-btn"
                              aria-label={collageStrings.deconstructSelectLayer(layer.name)}
                              aria-pressed={isSelected}
                              onClick={stop(() => toggleSelect(layer.id))}
                            >
                              <span aria-hidden="true">✓</span>
                            </button>
                            <button type="button" className="deconstruct-icon-btn" aria-label={collageStrings.deconstructMoveLayerUp(layer.name)} onClick={stop(() => moveLayer(layer.id, 1))}>
                              <span aria-hidden="true">▲</span>
                            </button>
                            <button type="button" className="deconstruct-icon-btn" aria-label={collageStrings.deconstructMoveLayerDown(layer.name)} onClick={stop(() => moveLayer(layer.id, -1))}>
                              <span aria-hidden="true">▼</span>
                            </button>
                            <button
                              type="button"
                              className="deconstruct-icon-btn"
                              aria-label={collageStrings.deconstructExportLayer(layer.name)}
                              disabled={busy !== null}
                              onClick={stop(() => void exportOneLayer(layer))}
                            >
                              <span aria-hidden="true">⤓</span>
                            </button>
                            <button type="button" className="deconstruct-icon-btn danger" aria-label={collageStrings.deconstructDeleteLayer(layer.name)} onClick={stop(() => removeLayer(layer.id))}>
                              <span aria-hidden="true">✕</span>
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {/* 4 — correction tools */}
          {phase === 'ready' && result ? (
            <section className="deconstruct-section" aria-labelledby="deconstruct-section-tools">
              <h3 className="deconstruct-section-title" id="deconstruct-section-tools">
                {collageStrings.deconstructStepTools}
              </h3>
              <div className="deconstruct-btn-row" role="group" aria-label={collageStrings.deconstructTools}>
                {(['none', 'erase', 'restore'] as const).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className="deconstruct-btn"
                    aria-pressed={tool === entry}
                    disabled={entry !== 'none' && !toolLayer}
                    onClick={() => setTool((current) => (current === entry ? 'none' : entry))}
                  >
                    {entry === 'none' ? collageStrings.deconstructToolNone : entry === 'erase' ? collageStrings.deconstructErase : collageStrings.deconstructRestore}
                  </button>
                ))}
              </div>
              <p className="deconstruct-hint">{toolReason ?? collageStrings.deconstructToolHint}</p>
              {busy === 'rect' ? (
                <p className="deconstruct-hint" role="status">
                  {collageStrings.deconstructToolBusy}
                </p>
              ) : null}
              <div className="deconstruct-btn-row">
                <button type="button" className="deconstruct-btn" disabled={!canSplit || busy !== null} onClick={() => void splitLayer()}>
                  {collageStrings.deconstructSplit}
                </button>
                <button type="button" className="deconstruct-btn" disabled={selectedIds.length < 2 || busy !== null} onClick={() => void mergeLayers()}>
                  {collageStrings.deconstructMerge}
                </button>
              </div>
              {splitReason ? <p className="deconstruct-hint">{splitReason}</p> : null}
              {mergeReason ? <p className="deconstruct-hint">{mergeReason}</p> : null}
              <button type="button" className="deconstruct-btn wide" disabled={!source || busy !== null} onClick={() => void extractAgain()}>
                {collageStrings.deconstructExtractAgain}
              </button>
              {!source ? <p className="deconstruct-hint">{collageStrings.deconstructUpload}</p> : null}
            </section>
          ) : null}

          {/* 5 — background */}
          {phase === 'ready' && result ? (
            <section className="deconstruct-section" aria-labelledby="deconstruct-section-background">
              <h3 className="deconstruct-section-title" id="deconstruct-section-background">
                {collageStrings.deconstructStepBackground}
              </h3>
              {result.background.reconstructedDataUrl === null ? <p className="deconstruct-hint">{collageStrings.deconstructNoReconstruction}</p> : null}
              <button type="button" className="deconstruct-btn wide" disabled={busy !== null || !hasLayers} onClick={() => void regenerateBackground()}>
                {busy === 'background' ? collageStrings.deconstructRegenerating : collageStrings.deconstructRegenerate}
              </button>
              {!hasLayers ? <p className="deconstruct-hint">{collageStrings.deconstructRegenerateNeedsLayers}</p> : null}
              <div className="deconstruct-btn-row">
                <button
                  type="button"
                  className="deconstruct-btn"
                  disabled={!result.background.reconstructedDataUrl || backgroundChoice === 'reconstructed'}
                  onClick={() => {
                    setBackgroundChoice('reconstructed')
                    setNotice(collageStrings.deconstructAccepted)
                  }}
                >
                  {collageStrings.deconstructAccept}
                </button>
                <button
                  type="button"
                  className="deconstruct-btn danger"
                  disabled={!result.background.reconstructedDataUrl || backgroundChoice === 'original'}
                  onClick={() => {
                    setBackgroundChoice('original')
                    setNotice(collageStrings.deconstructRejected)
                  }}
                >
                  {collageStrings.deconstructReject}
                </button>
              </div>
              <p className="deconstruct-hint">{backgroundChoice === 'reconstructed' ? collageStrings.deconstructReconstructed : collageStrings.deconstructOriginal}</p>
            </section>
          ) : null}

          {/* 6 — results */}
          {phase === 'ready' && activeResult ? (
            <section className="deconstruct-section" aria-labelledby="deconstruct-section-results">
              <h3 className="deconstruct-section-title" id="deconstruct-section-results">
                {collageStrings.deconstructStepResults}
              </h3>
              <button type="button" className="deconstruct-btn primary wide" disabled={!hasLayers || busy !== null} onClick={() => void commitToCanvas()}>
                {collageStrings.deconstructAddToCanvas}
              </button>
              {!hasLayers ? <p className="deconstruct-hint">{collageStrings.deconstructAddNeedsLayers}</p> : null}

              <fieldset className="deconstruct-radios">
                <legend>{collageStrings.deconstructExportMode}</legend>
                <label>
                  <input type="radio" name="deconstruct-export-mode" checked={exportMode === 'cropped'} onChange={() => setExportMode('cropped')} />
                  {collageStrings.deconstructExportCropped}
                </label>
                <label>
                  <input type="radio" name="deconstruct-export-mode" checked={exportMode === 'full-canvas'} onChange={() => setExportMode('full-canvas')} />
                  {collageStrings.deconstructExportFull}
                </label>
              </fieldset>

              <div className="deconstruct-btn-row">
                <button type="button" className="deconstruct-btn" disabled={!hasLayers || busy !== null} onClick={() => void exportAllLayers()}>
                  {collageStrings.deconstructExportLayers}
                </button>
                <button type="button" className="deconstruct-btn" disabled={busy !== null} onClick={() => void exportBackground()}>
                  {collageStrings.deconstructExportBackground}
                </button>
                <button type="button" className="deconstruct-btn" disabled={busy !== null} onClick={() => void exportManifest()}>
                  {collageStrings.deconstructExportManifest}
                </button>
              </div>
              {!hasLayers ? <p className="deconstruct-hint">{collageStrings.deconstructExportNeedsLayers}</p> : null}

              <button type="button" className="deconstruct-btn wide" disabled={!source || busy !== null} onClick={() => void extractAgain()}>
                {collageStrings.deconstructExportAll}
              </button>
              <p className="deconstruct-hint">{collageStrings.deconstructExportAllHint}</p>
            </section>
          ) : null}

          {busy !== null && busy !== 'rect' && busy !== 'background' ? (
            <p className="deconstruct-notice" role="status">
              {collageStrings.deconstructBusy}
            </p>
          ) : null}
          {notice ? (
            <p className="deconstruct-notice" role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="deconstruct-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
