/**
 * Camera Raw Studio — Doory image studio (raw + retouch + artistic effects + expand + neural upscale).
 *
 * Architecture notes (audit-verified):
 * - Engine: Fabric 7; the studio works on the selected image's `docSrc` asset and applies through
 *   `assets.upload` + `insert.replaceSelectedImage`, which preserves frame/position/mask and records
 *   the operation in the editor's own undo history.
 * - Raw pipeline: `engine/imageStudio/webglPipeline.ts` (WebGL2, non-destructive, linear-light).
 * - All heavy modules are lazily imported; nothing here loads until this modal opens.
 * - Honest labels: classical algorithms are never advertised as AI. Neural upscale requires a
 *   self-hosted ONNX model (`/media/models/real-esrgan/*.onnx`) and reports a typed error when the
 *   file is missing; generative expand reports its missing backend instead of faking output.
 * - Processing order everywhere (preview AND full-res):
 *   expand → raw (GPU) → retouch → artistic effect → neural upscale (last, full-res only).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Download, X, Camera, RotateCcw, Undo2, Redo2, SlidersHorizontal,
  Wand2, Brush, Palette, Expand, ImagePlus, Loader2, MousePointerClick,
} from 'lucide-react'
import { useEditor, useEditorState } from '../context'
import {
  CONTROLS, CONTROL_ORDER, DEFAULT_PARAMS, PRESETS, applyPreset, clampParams,
  type PresetId, type StudioParamKey, type StudioParams,
} from '../engine/imageStudio/params'
import { StudioPipeline, StudioPipelineError } from '../engine/imageStudio/webglPipeline'
import { applyEffect, type EffectKind } from '../engine/imageStudio/filters'
import { skinSmooth, denoise, selectiveSharpen } from '../engine/imageStudio/retouch'
import { computeExpandRect, expandClassical, GENERATIVE_EXPAND_BLOCKED, type EdgeSpec } from '../engine/imageStudio/expand'
import { floodSelect } from '../engine/imageStudio/floodSelect'
import { NEURAL_MODELS, NeuralUpscaleError, runNeuralUpscale, type NeuralModelDescriptor } from '../engine/imageStudio/upscaleNeural'

type Stage = 'loading' | 'ready' | 'applying' | 'error'

interface RetouchState { smoothing: number; texturePreserve: number; denoise: number; sharpen: number }
const RETOUCH_DEFAULT: RetouchState = { smoothing: 0, texturePreserve: 0.65, denoise: 0, sharpen: 0 }

interface EffectState { kind: EffectKind | 'none'; strength: number; level: number }
const EFFECT_DEFAULT: EffectState = { kind: 'none', strength: 1, level: 0.5 }

interface ExpandState { unit: 'percent' | 'pixels'; top: number; right: number; bottom: number; left: number; mode: 'mirror' | 'replicate' }
const EXPAND_DEFAULT: ExpandState = { unit: 'percent', top: 0, right: 0, bottom: 0, left: 0, mode: 'mirror' }

interface NeuralState {
  modelId: string
  running: boolean
  progress: number
  error: string | null
  done: boolean
  outW: number
  outH: number
  ms: number
}
const NEURAL_DEFAULT: NeuralState = { modelId: NEURAL_MODELS[0].id, running: false, progress: 0, error: null, done: false, outW: 0, outH: 0, ms: 0 }

/** Live-preview source budget — keeps per-gesture renders cheap. */
const PREVIEW_MAX = 900

/** Arabic labels with technical English names — the studio is Arabic-first / RTL. */
const CONTROL_LABELS: Record<StudioParamKey, { ar: string; en: string }> = {
  exposure: { ar: 'الإضاءة', en: 'Exposure' },
  brightness: { ar: 'السطوع', en: 'Brightness' },
  contrast: { ar: 'الكونتراست', en: 'Contrast' },
  gamma: { ar: 'غاما', en: 'Gamma' },
  whites: { ar: 'الأبيضات', en: 'Whites' },
  blacks: { ar: 'الأسود', en: 'Blacks' },
  highlights: { ar: 'الهايلايت', en: 'Highlights' },
  shadows: { ar: 'الظلال', en: 'Shadows' },
  blackPoint: { ar: 'نقطة السواد', en: 'Black point' },
  whitePoint: { ar: 'نقطة البياض', en: 'White point' },
  temperature: { ar: 'حرارة اللون', en: 'Temperature' },
  tint: { ar: 'التدرّج', en: 'Tint' },
  saturation: { ar: 'التشبع', en: 'Saturation' },
  vibrance: { ar: 'الحيوية', en: 'Vibrance' },
  hue: { ar: 'دوران الطيف', en: 'Hue' },
  sharpness: { ar: 'الحدة', en: 'Sharpness' },
  denoise: { ar: 'إزالة الضجيج', en: 'Denoise' },
  clarity: { ar: 'الوضوح', en: 'Clarity' },
  texture: { ar: 'الملمس', en: 'Texture' },
  dehaze: { ar: 'إزالة الغباش', en: 'Dehaze' },
  vignette: { ar: 'فيينيت', en: 'Vignette' },
  grain: { ar: 'الحبيبات', en: 'Grain' },
}

const SECTION_OF: Record<StudioParamKey, 'light' | 'color' | 'detail' | 'optics'> = (() => {
  const map = {} as Record<StudioParamKey, 'light' | 'color' | 'detail' | 'optics'>
  for (const key of CONTROL_ORDER.slice(0, 10)) map[key] = 'light'
  for (const key of CONTROL_ORDER.slice(10, 15)) map[key] = 'color'
  for (const key of CONTROL_ORDER.slice(15, 20)) map[key] = 'detail'
  for (const key of CONTROL_ORDER.slice(20)) map[key] = 'optics'
  return map
})()

const TAB_DEFS = [
  { id: 'raw', label: 'الكاميرا رو', en: 'Camera Raw', Icon: SlidersHorizontal },
  { id: 'retouch', label: 'ريتوش', en: 'Retouch', Icon: Brush },
  { id: 'effects', label: 'تأثيرات فنية', en: 'Artistic', Icon: Palette },
  { id: 'expand', label: 'توسيع الكادر', en: 'Expand', Icon: Expand },
  { id: 'upscale', label: 'تكبير عصبي (AI)', en: 'Neural upscale', Icon: Wand2 },
  { id: 'select', label: 'سيلكت كلاسيكي', en: 'Classic Select', Icon: MousePointerClick },
] as const
type TabId = (typeof TAB_DEFS)[number]['id']

function checkerStyle(): React.CSSProperties {
  return {
    backgroundImage:
      'linear-gradient(45deg, rgba(128,128,128,0.12) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.12) 25%, transparent 25%),' +
      'linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.12) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.12) 75%)',
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
  }
}

interface SessionSnapshot {
  raw: string
  retouch: RetouchState
  effect: EffectState
  expand: ExpandState
}

function snapshotOf(raw: StudioParams, retouch: RetouchState, effect: EffectState, expand: ExpandState): SessionSnapshot {
  return { raw: JSON.stringify(CONTROL_ORDER.map((k) => raw[k])), retouch: { ...retouch }, effect: { ...effect }, expand: { ...expand } }
}

function snapshotJson(raw: StudioParams, ret: RetouchState, eff: EffectState, exp: ExpandState): string {
  return JSON.stringify(snapshotOf(raw, ret, eff, exp))
}

function parseSnap(json: string): SessionSnapshot {
  return JSON.parse(json) as SessionSnapshot
}

export default function CameraRawStudioModal({ onClose }: { onClose: () => void }) {
  const editor = useEditor()
  const selection = useEditorState((s) => s.selection)
  const [stage, setStage] = useState<Stage>('loading')
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('raw')
  const [rawParams, setRawParams] = useState<StudioParams>({ ...DEFAULT_PARAMS })
  const [retouch, setRetouch] = useState<RetouchState>({ ...RETOUCH_DEFAULT })
  const [effect, setEffect] = useState<EffectState>({ ...EFFECT_DEFAULT })
  const [expand, setExpand] = useState<ExpandState>({ ...EXPAND_DEFAULT })
  const [neural, setNeural] = useState<NeuralState>({ ...NEURAL_DEFAULT })
  const [compare, setCompare] = useState(false)
  const [split, setSplit] = useState(50)
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [exportFormat, setExportFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png')
  const [jpegQuality, setJpegQuality] = useState(0.92)
  const [hasAlpha, setHasAlpha] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number } | null>(null)

  // Pristine full-res session source + downscaled GPU source.
  const pristineRef = useRef<HTMLCanvasElement | null>(null)
  const pipelineRef = useRef<StudioPipeline | null>(null)
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const originalDisplayRef = useRef<HTMLCanvasElement | null>(null)
  const processedDisplayRef = useRef<HTMLCanvasElement | null>(null)
  const expandPreviewRef = useRef<HTMLCanvasElement | null>(null)
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const renderTimerRef = useRef<number | null>(null)

  // Studio-level undo/redo over the full parameter state.
  const historyRef = useRef<{ past: SessionSnapshot[]; future: SessionSnapshot[] }>({ past: [], future: [] })
  const lastPushed = useRef<string>('')
  useEffect(() => {
    const json = snapshotJson(rawParams, retouch, effect, expand)
    const h = historyRef.current
    if (h.past.length === 0 || lastPushed.current !== json) {
      historyRef.current = { past: [...h.past.slice(-60), parseSnap(json)], future: [] }
      lastPushed.current = json
    }
  }, [rawParams, retouch, effect, expand])

  function snapToRaw(s: SessionSnapshot): { raw: StudioParams; retouch: RetouchState; effect: EffectState; expand: ExpandState } {
    return {
      raw: clampParams(Object.fromEntries(CONTROL_ORDER.map((k, i) => [k, (JSON.parse(s.raw) as number[])[i]])) as StudioParams),
      retouch: s.retouch,
      effect: s.effect,
      expand: s.expand,
    }
  }

  const studioUndo = useCallback((): void => {
    const h = historyRef.current
    const past = h.past.slice()
    const cur = past.pop()
    if (!cur) return
    // The snapshot BEFORE the previous one is the actual "previous" visual state.
    const previous = past[past.length - 1] ?? cur
    historyRef.current = { past, future: [...h.future, cur] }
    const target = previous ? snapToRaw(previous) : null
    if (target) { setRawParams(target.raw); setRetouch(target.retouch); setEffect(target.effect); setExpand(target.expand) }
  }, [])

  const studioRedo = useCallback((): void => {
    const h = historyRef.current
    const future = h.future.slice()
    const toRedo = future.pop()
    if (toRedo) {
      historyRef.current = { past: [...h.past, toRedo], future }
      const target = snapToRaw(toRedo)
      setRawParams(target.raw); setRetouch(target.retouch); setEffect(target.effect); setExpand(target.expand)
    }
  }, [])

  // ---------------------------------------------------------------
  // Session bootstrap
  // ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    const boot = async (): Promise<void> => {
      const obj = selection.objects?.find((o) => o.type === 'image')
      const rawSrc = obj ? ((obj.docSrc as string | undefined) ?? (obj.src as string | undefined)) : undefined
      if (!rawSrc) {
        setError('افتح الاستوديو مع تحديد صورة أولاً.')
        setStage('error')
        return
      }
      try {
        const url = await editor.assets.resolve(rawSrc).catch(() => rawSrc)
        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('load failed'))
          img.src = url
        })
        if (cancelled) return
        const c = document.createElement('canvas')
        c.width = img.naturalWidth || 1
        c.height = img.naturalHeight || 1
        c.getContext('2d')!.drawImage(img, 0, 0)
        pristineRef.current = c
        setSourceDims({ w: c.width, h: c.height })

        // Alpha scan (JPEG destroys alpha; warn before export).
        let alphaFound = false
        if (c.width * c.height <= 24_000_000) {
          const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data
          for (let i = 3; i < d.length; i += 4) { if (d[i] < 250) { alphaFound = true; break } }
        }
        setHasAlpha(alphaFound)
        setStage('ready')
      } catch {
        if (!cancelled) { setError('تعذر تحميل الصورة المصدر.'); setStage('error') }
      }
    }
    void boot()
    return () => { cancelled = true }
  }, [editor, selection])

  const ensurePipeline = useCallback((): StudioPipeline | null => {
    if (pipelineRef.current) return pipelineRef.current
    try {
      const glCanvas = document.createElement('canvas')
      glCanvasRef.current = glCanvas
      const pipe = StudioPipeline.create(glCanvas)
      pipelineRef.current = pipe
      return pipe
    } catch (err) {
      setError(err instanceof StudioPipelineError ? `معالجة الرسوميات غير متاحة: ${err.message}` : 'WebGL2 غير متاح في هذا المتصفح.')
      return null
    }
  }, [])

  /** GPU-bound preview source: pristine downscaled → expanded (order matches the full chain). */
  const buildPreviewSource = useCallback((): { pixels: ImageData; expandedRect: { offsetX: number; offsetY: number; width: number; height: number } | null; originalW: number; originalH: number; backbone: HTMLCanvasElement } | null => {
    const pristine = pristineRef.current
    if (!pristine) return null
    const k = Math.min(1, PREVIEW_MAX / Math.max(pristine.width, pristine.height))
    const sw = Math.max(1, Math.round(pristine.width * k))
    const sh = Math.max(1, Math.round(pristine.height * k))
    const small = document.createElement('canvas')
    small.width = sw; small.height = sh
    const sctx = small.getContext('2d', { willReadFrequently: true })!
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(pristine, 0, 0, sw, sh)
    const pristinePixels: ImageData = sctx.getImageData(0, 0, sw, sh)

    const anyEdge = expand.top || expand.right || expand.bottom || expand.left
    if (!anyEdge) {
      return { pixels: pristinePixels, expandedRect: null, originalW: sw, originalH: sh, backbone: small }
    }
    const spec: EdgeSpec = { top: expand.top, right: expand.right, bottom: expand.bottom, left: expand.left, unit: expand.unit }
    const rect = computeExpandRect(sw, sh, spec)
    const data = expandClassical({ data: pristinePixels.data, width: sw, height: sh }, expand.mode, rect)
    const out = document.createElement('canvas')
    out.width = rect.width; out.height = rect.height
    out.getContext('2d')!.putImageData(new ImageData(data, rect.width, rect.height), 0, 0)
    return {
      pixels: new ImageData(data, rect.width, rect.height),
      expandedRect: { offsetX: rect.offsetX, offsetY: rect.offsetY, width: rect.width, height: rect.height },
      originalW: sw,
      originalH: sh,
      backbone: out,
    }
  }, [expand])

  /** Full redraw: GPU raw → CPU retouch → CPU effect. Debounced ~80ms. */
  useEffect(() => {
    if (stage !== 'ready') return
    if (renderTimerRef.current !== null) window.clearTimeout(renderTimerRef.current)
    renderTimerRef.current = window.setTimeout(() => {
      requestAnimationFrame(() => {
        const pipe = ensurePipeline()
        const pristine = pristineRef.current
        if (!pipe || !pristine) return
        const built = buildPreviewSource()
        if (!built) return
        const { pixels, expandedRect, originalW, originalH, backbone } = built

        pipe.setSource(backbone, pixels.width, pixels.height)
        pipe.render(rawParams)
        const gl = glCanvasRef.current
        const display = processedDisplayRef.current
        if (!gl || !display) return
        display.width = pixels.width
        display.height = pixels.height
        const dctx = display.getContext('2d')!
        dctx.clearRect(0, 0, display.width, display.height)
        dctx.drawImage(gl, 0, 0)
        const buf = dctx.getImageData(0, 0, display.width, display.height)

        let work = buf.data
        if (retouch.smoothing > 0 || retouch.denoise > 0 || retouch.sharpen > 0) {
          const px = { data: work, width: buf.width, height: buf.height }
          if (retouch.smoothing > 0) work = skinSmooth(px, { intensity: retouch.smoothing, texturePreserve: retouch.texturePreserve })
          if (retouch.denoise > 0) work = denoise({ data: work, width: buf.width, height: buf.height }, retouch.denoise)
          if (retouch.sharpen > 0) work = selectiveSharpen({ data: work, width: buf.width, height: buf.height }, retouch.sharpen)
        }
        if (effect.kind !== 'none') {
          work = applyEffect({ data: work, width: buf.width, height: buf.height }, effect.kind, { strength: effect.strength, level: effect.level })
        }
        const dirty = work !== buf.data
        if (dirty) dctx.putImageData(new ImageData(work, buf.width, buf.height), 0, 0)

        // "Before" canvas: the same expansion, no adjustments at all.
        const original = originalDisplayRef.current
        if (original) {
          original.width = pixels.width; original.height = pixels.height
          const octx = original.getContext('2d')!
          octx.clearRect(0, 0, original.width, original.height)
          octx.drawImage(backbone, 0, 0)
        }

        // Expand tab preview: expanded frame + dashed outline of where the original sits.
        const ex = expandPreviewRef.current
        if (ex) {
          ex.width = pixels.width; ex.height = pixels.height
          const ectx = ex.getContext('2d')!
          ectx.clearRect(0, 0, ex.width, ex.height)
          ectx.drawImage(backbone, 0, 0)
          if (expandedRect) {
            ectx.strokeStyle = '#7c5cff'
            ectx.setLineDash([6, 6])
            ectx.lineWidth = Math.max(2, Math.round(ex.width / 200))
            ectx.strokeRect(expandedRect.offsetX, expandedRect.offsetY, originalW, originalH)
          }
        }
        // The zoom controls size the canvas in CSS pixels — record the rendered buffer size.
        setPreviewSize((p) => (p && p.w === pixels.width && p.h === pixels.height ? p : { w: pixels.width, h: pixels.height }))
      })
    }, 80)
    return () => {
      if (renderTimerRef.current !== null) window.clearTimeout(renderTimerRef.current)
    }
  }, [stage, ensurePipeline, buildPreviewSource, rawParams, retouch, effect, expand])

  // Dispose the WebGL context once.
  useEffect(() => () => {
    pipelineRef.current?.dispose()
    pipelineRef.current = null
  }, [])

  // ---------------------------------------------------------------
  // Zoom (Ctrl/⌘ + wheel, plus header buttons); pan via native scroll.
  // Numerical zoom sizes the canvas in CSS pixels so the scroll container grows
  // with it — `transform: scale` would only clip visually without ever scrolling.
  // ---------------------------------------------------------------
  const zoomTo = useCallback((factor: number | 'fit'): void => {
    setZoom((z) => {
      const base = z === 'fit' ? 1 : z
      if (factor === 'fit') return 'fit'
      const next = Math.min(8, Math.max(0.1, base * factor))
      return Math.abs(next - 1) < 0.06 ? 1 : next
    })
  }, [])

  const onWheelZoom = useCallback((e: WheelEvent): void => {
    if (!e.ctrlKey && !e.metaKey) return // plain wheel scrolls the preview like anywhere else
    e.preventDefault()
    zoomTo(e.deltaY < 0 ? 1.15 : 1 / 1.15)
  }, [zoomTo])
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.addEventListener('wheel', onWheelZoom, { passive: false })
    return () => viewer.removeEventListener('wheel', onWheelZoom)
  }, [onWheelZoom])

  // ---------------------------------------------------------------
  // Final full-resolution chain, then delivery.
  // ---------------------------------------------------------------
  const renderFullRes = useCallback(async (onStep?: (label: string) => void): Promise<HTMLCanvasElement> => {
    const pipe = ensurePipeline()
    const pristine = pristineRef.current
    if (!pipe || !pristine) throw new Error('لا يوجد مصدر للصورة.')
    onStep?.('توسيع الكادر…')
    const anyEdge = expand.top || expand.right || expand.bottom || expand.left
    let base: HTMLCanvasElement = pristine
    if (anyEdge) {
      const spec: EdgeSpec = { top: expand.top, right: expand.right, bottom: expand.bottom, left: expand.left, unit: expand.unit }
      const rect = computeExpandRect(pristine.width, pristine.height, spec)
      const full = pristine.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, pristine.width, pristine.height)
      const data = expandClassical({ data: full.data, width: full.width, height: full.height }, expand.mode, rect)
      const canvas = document.createElement('canvas')
      canvas.width = rect.width; canvas.height = rect.height
      canvas.getContext('2d')!.putImageData(new ImageData(data, rect.width, rect.height), 0, 0)
      base = canvas
    }
    // GPU raw at base resolution.
    onStep?.('معالجة اللون والإضاءة (GPU)…')
    pipe.setSource(base, base.width, base.height)
    pipe.render(rawParams, base.width, base.height)
    const out = document.createElement('canvas')
    out.width = base.width; out.height = base.height
    const octx = out.getContext('2d', { willReadFrequently: true })!
    if (glCanvasRef.current) octx.drawImage(glCanvasRef.current, 0, 0)
    // CPU retouch + effect at full res (one pass each; the event loop yields between steps).
    const px = { data: octx.getImageData(0, 0, out.width, out.height).data, width: out.width, height: out.height }
    if (retouch.smoothing > 0) {
      onStep?.('تنعيم البشرة…')
      await Promise.resolve()
      px.data.set(skinSmooth(px, { intensity: retouch.smoothing, texturePreserve: retouch.texturePreserve }))
    }
    if (retouch.denoise > 0) {
      onStep?.('إزالة الضجيج…')
      await Promise.resolve()
      px.data.set(denoise(px, retouch.denoise))
    }
    if (retouch.sharpen > 0) {
      onStep?.('الحدة الانتقائية…')
      await Promise.resolve()
      px.data.set(selectiveSharpen(px, retouch.sharpen))
    }
    if (effect.kind !== 'none') {
      onStep?.('التأثيرات الفنية…')
      await Promise.resolve()
      px.data.set(applyEffect(px, effect.kind, { strength: effect.strength, level: effect.level }))
    }
    octx.putImageData(new ImageData(px.data, px.width, px.height), 0, 0)
    // Neural upscale LAST (only when the user explicitly ran it and it succeeded).
    if (neural.done && neural.outW > 0) {
      onStep?.('التكبير العصبي…')
      await Promise.resolve()
      const model = NEURAL_MODELS.find((m) => m.id === neural.modelId) ?? NEURAL_MODELS[0]
      const result = await runNeuralUpscale({ data: px.data, width: px.width, height: px.height }, model)
      const upscaled = document.createElement('canvas')
      upscaled.width = result.width; upscaled.height = result.height
      upscaled.getContext('2d')!.putImageData(new ImageData(result.data, result.width, result.height), 0, 0)
      return upscaled
    }
    return out
  }, [ensurePipeline, expand, rawParams, retouch, effect, neural.done, neural.modelId, neural.outW])

  const applyToEditor = useCallback(async (): Promise<void> => {
    const pristine = pristineRef.current
    if (!pristine) return
    const t0 = performance.now()
    try {
      setStage('applying')
      setBusy('تجهيز النتيجة كاملة الدقة…')
      const canvas = await renderFullRes(setBusy)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('تعذر ترميز الصورة النهائية.')
      const file = new File([blob], 'camera-raw-result.png', { type: 'image/png' })
      const ref = await editor.assets.upload(file, 'استوديو الصورة')
      await editor.insert.replaceSelectedImage(ref, 'استوديو الكاميرا رو')
      const ms = Math.round(performance.now() - t0)
      editor.toast(`تم تطبيق التعديلات على الصورة (${ms} مللي ثانية). تراجع متاح من المحرر.`, 'success')
      onClose()
    } catch (err) {
      setStage('ready')
      editor.toast(err instanceof Error ? err.message : 'فشل التطبيق', 'error')
    } finally {
      setBusy(null)
    }
  }, [editor, renderFullRes, onClose])

  const exportImage = useCallback(async (format: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<void> => {
    if (format === 'image/jpeg' && hasAlpha) {
      editor.toast('تنبيه: JPEG لا يدعم الشفافية — القنوات الشفافة ستفقد.', 'info')
    }
    try {
      setStage('applying')
      setBusy('تصدير…')
      const canvas = await renderFullRes(setBusy)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, format === 'image/png' ? undefined : jpegQuality))
      if (!blob) throw new Error('تعذر ترميز الصورة النهائية.')
      const ext = format.split('/')[1]
      const link = document.createElement('a')
      link.download = `studio-export.${ext}`
      link.href = URL.createObjectURL(blob)
      link.click()
      URL.revokeObjectURL(link.href)
      editor.toast('تم تصدير الصورة كاملة الدقة.', 'success')
    } catch (err) {
      editor.toast(err instanceof Error ? err.message : 'فشل التصدير', 'error')
    } finally {
      setStage('ready')
      setBusy(null)
    }
  }, [editor, renderFullRes, jpegQuality, hasAlpha])

  // ---------------------------------------------------------------
  // Neural upscale — REAL ONNX inference or an honest typed error.
  // ---------------------------------------------------------------
  const runNeural = useCallback(async (): Promise<void> => {
    const model = NEURAL_MODELS.find((m) => m.id === neural.modelId) ?? NEURAL_MODELS[0]
    setNeural((n) => ({ ...n, running: true, progress: 0, error: null, done: false }))
    const t0 = performance.now()
    try {
      // The network upscales the CURRENT processed art (raw + retouch + effect + expand), full res.
      const canvas = await renderFullRes(setBusy)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const result = await runNeuralUpscale(
        { data: pixels.data, width: pixels.width, height: pixels.height },
        model,
        { onProgress: (pct) => setNeural((n) => ({ ...n, progress: pct })) },
      )
      const out = document.createElement('canvas')
      out.width = result.width; out.height = result.height
      out.getContext('2d')!.putImageData(new ImageData(result.data, result.width, result.height), 0, 0)
      setNeural((n) => ({ ...n, running: false, done: true, progress: 100, outW: result.width, outH: result.height, ms: Math.round(performance.now() - t0) }))
      // Preview the result, scaled to fit the usual display budget.
      const display = processedDisplayRef.current
      if (display) {
        const kOut = Math.min(1, PREVIEW_MAX / Math.max(out.width, out.height))
        display.width = Math.max(1, Math.round(out.width * kOut))
        display.height = Math.max(1, Math.round(out.height * kOut))
        display.getContext('2d')!.drawImage(out, 0, 0, display.width, display.height)
      }
    } catch (err) {
      const message = err instanceof NeuralUpscaleError
        ? err.message
        : `فشل التكبير العصبي: ${err instanceof Error ? err.message : String(err)}`
      setNeural((n) => ({ ...n, running: false, error: message, done: false }))
    }
  }, [neural.modelId, renderFullRes])

  const resetAll = useCallback((): void => {
    setRawParams({ ...DEFAULT_PARAMS })
    setRetouch({ ...RETOUCH_DEFAULT })
    setEffect({ ...EFFECT_DEFAULT })
    setExpand({ ...EXPAND_DEFAULT })
    setNeural({ ...NEURAL_DEFAULT })
  }, [])

  const onPreset = useCallback((preset: PresetId): void => {
    setRawParams(applyPreset(preset))
  }, [])

  if (stage === 'loading') {
    return <Overlay><CenterNote text="يتم تحميل الصورة المحددة…" /></Overlay>
  }
  if (stage === 'error') {
    return (
      <Overlay>
        <div style={{ ...panelStyle, width: 460, height: 'auto', maxHeight: 'none', flexDirection: 'column', padding: 24, textAlign: 'center', gap: 12, display: 'flex' }}>
          <p style={{ color: 'var(--ed-text)', margin: 0 }}>{error}</p>
          <button style={BTN.primary} onClick={onClose}>إغلاق</button>
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay>
      <div style={panelStyle}>
        {/* LEFT/CENTER — preview + footer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--ed-border)' }}>
            <Camera size={16} />
            <strong style={{ color: 'var(--ed-text)', fontSize: 14 }}>استوديو الصورة — Camera Raw</strong>
            <span style={{ flex: 1 }} />
            {sourceDims && (
              <span style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>
                {sourceDims.w}×{sourceDims.h}
                {neural.done && <> → {neural.outW}×{neural.outH}</>}
              </span>
            )}
            <button style={BTN.dim} onClick={() => zoomTo(1 / 1.25)} title="تصغير">−</button>
            <span style={{ fontSize: 11, color: 'var(--ed-text-dim)', minWidth: 40, textAlign: 'center' }}>
              {zoom === 'fit' ? 'ملء' : `${Math.round(zoom * 100)}%`}
            </span>
            <button style={BTN.dim} onClick={() => zoomTo(1.25)} title="تكبير">+</button>
            <button style={BTN.dim} onClick={() => setZoom(1)}>100%</button>
            <button style={BTN.dim} onClick={() => setZoom('fit')}>ملء المعاينة</button>
            <button style={compare ? BTN.active : BTN.dim} onClick={() => setCompare((c) => !c)}>قبل / بعد</button>
            <button style={BTN.dim} aria-label="إغلاق" onClick={onClose}><X size={14} /></button>
          </div>

          <div
            ref={viewerRef}
            style={{ flex: 1, overflow: 'auto', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--ed-surface)', ...checkerStyle() }}
          >
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
              <div
                style={{ position: 'relative', ...(zoom === 'fit' ? { maxWidth: '100%' } : { width: previewSize?.w ? `${previewSize.w * zoom}px` : undefined }) }}
                data-studio-split-host
              >
                <canvas
                  ref={processedDisplayRef}
                  style={{ ...(zoom === 'fit' ? { maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, border: '1px solid var(--ed-border)', boxShadow: '0 8px 30px rgba(0,0,0,0.35)', background: 'var(--ed-surface-2)', display: 'block' } : { width: `${previewSize?.w ? previewSize.w * zoom : 300}px`, borderRadius: 8, border: '1px solid var(--ed-border)', boxShadow: '0 8px 30px rgba(0,0,0,0.35)', background: 'var(--ed-surface-2)', display: 'block', imageRendering: zoom >= 2 ? 'pixelated' : undefined }), cursor: tab === 'select' ? 'crosshair' : undefined }}
                  onDoubleClick={() => setZoom('fit')}
                  onClick={(e) => {
                    if (tab !== 'select') return
                    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect()
                    const x = Math.floor((e.clientX - rect.left) * (sourceDims?.w ?? 1) / rect.width)
                    const y = Math.floor((e.clientY - rect.top) * (sourceDims?.h ?? 1) / rect.height)
                    const displayCtx = (e.currentTarget as HTMLCanvasElement).getContext('2d')
                    if (!displayCtx || !sourceDims) return
                    try {
                      const w = rect.width, h = rect.height
                      const imgData = displayCtx.getImageData(0, 0, w, h)
                      const mask = floodSelect(
                        { data: imgData.data, width: Math.round(w), height: Math.round(h) },
                        Math.min(x, Math.round(w) - 1),
                        Math.min(y, Math.round(h) - 1),
                        32,
                      )
                      const overlayData = displayCtx.createImageData(w, h)
                      let minX = w, maxX = 0, minY = h, maxY = 0
                      for (let i = 0; i < w * h; i++) {
                        if (mask[i] > 128) {
                          overlayData.data[i * 4] = 255
                          overlayData.data[i * 4 + 1] = 30
                          overlayData.data[i * 4 + 2] = 30
                          overlayData.data[i * 4 + 3] = 160
                          const px = i % w, py = Math.floor(i / w)
                          if (px < minX) minX = px; if (px > maxX) maxX = px
                          if (py < minY) minY = py; if (py > maxY) maxY = py
                        }
                      }
                      displayCtx.putImageData(overlayData, 0, 0)
                      for (let i = 0; i < w * h; i++) {
                        if (mask[i] <= 128) imgData.data[i * 4 + 3] = 0
                      }
                      displayCtx.putImageData(imgData, 0, 0)
                      if (minX <= maxX && minY <= maxY) {
                        displayCtx.save()
                        displayCtx.strokeStyle = '#7c5cff'
                        displayCtx.lineWidth = 2
                        displayCtx.setLineDash([6, 4])
                        displayCtx.strokeRect(minX, minY, maxX - minX + 1, maxY - minY + 1)
                        displayCtx.restore()
                      }
                      alert('تم تحديد كلاسيكي (Flood Fill) — الصورة مخفية خارج الشكل + حدود متقطعة + طبقة حمراء.')
                    } catch {
                      // Silent failure for classical algorithm
                    }
                  }}
                />
                <canvas
                  ref={originalDisplayRef}
                  style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 8,
                    border: '1px solid var(--ed-border)',
                    clipPath: compare ? `inset(0 ${100 - split}% 0 0)` : 'inset(0 100% 0 0)',
                    pointerEvents: 'none', background: 'var(--ed-surface-2)',
                  }}
                />
                {compare && <SplitSlider value={split} onChange={setSplit} />}
              </div>
            </div>
          </div>

          {/* FOOTER — always visible */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--ed-border)', flexWrap: 'wrap' }}>
            <button style={BTN.primary} onClick={() => void applyToEditor()} disabled={stage !== 'ready'}>تطبيق التعديلات</button>
            <button style={BTN.dim} onClick={onClose}>إلغاء</button>
            <button style={BTN.dim} onClick={studioUndo} title="تراجع (استوديو)"><Undo2 size={14} /></button>
            <button style={BTN.dim} onClick={studioRedo} title="إعادة (استوديو)"><Redo2 size={14} /></button>
            <button style={BTN.dim} onClick={resetAll} title="إعادة ضبط الكل"><RotateCcw size={14} /> إعادة ضبط</button>
            <span style={{ flex: 1 }} />
            <select
              style={{ ...inputBase, width: 'auto', padding: '4px 8px' }}
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)}
            >
              <option value="image/png">PNG — يحفظ الشفافية</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/webp">WebP</option>
            </select>
            {exportFormat !== 'image/png' && (
              <input type="range" min={0.3} max={1} step={0.01} value={jpegQuality} onChange={(e) => setJpegQuality(Number(e.target.value))} title="جودة الضغط" style={{ width: 80, accentColor: 'var(--ed-accent)' }} />
            )}
            <button style={BTN.dim} onClick={() => void exportImage(exportFormat)} disabled={stage !== 'ready'}>
              <Download size={14} /> تصدير
            </button>
            {busy && <span style={{ fontSize: 11, color: 'var(--ed-text-dim)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Loader2 size={12} /> {busy}</span>}
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{ width: 320, minWidth: 280, overflowY: 'auto', borderLeft: '1px solid var(--ed-border)', background: 'var(--ed-surface-2)', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TAB_DEFS.map((t) => (
            <button key={t.id} style={tab === t.id ? BTN.active : BTN.dim} onClick={() => setTab(t.id)}>
              <t.Icon size={14} style={{ marginLeft: 6, verticalAlign: 'middle' }} /> {t.label}
              <span style={{ fontSize: 10, color: 'var(--ed-text-dim)', marginRight: 6 }}>{t.en}</span>
            </button>
          ))}

          {tab === 'raw' && <RawTab params={rawParams} onChange={(key, v) => setRawParams((p) => clampParams({ ...p, [key]: v }))} onPreset={onPreset} />}
          {tab === 'retouch' && (
            <RetouchTab
              retouch={retouch}
              onChange={(key, v) => setRetouch((r) => ({ ...r, [key]: v }))}
            />
          )}
          {tab === 'effects' && <EffectsTab effect={effect} setEffect={setEffect} />}
          {tab === 'expand' && <ExpandTab expand={expand} setExpand={setExpand} onEdge={(k, v) => setExpand((e) => ({ ...e, [k]: Math.max(0, v) }))} previewRef={expandPreviewRef} />}
          {tab === 'upscale' && <NeuralTab neural={neural} onModel={(modelId) => setNeural((n) => ({ ...n, modelId }))} onRun={() => void runNeural()} />}
          {tab === 'select' && (
            <div style={{ padding: 10, fontSize: 12 }}>
              <strong>سيلكت كلاسيكي (Flood Fill)</strong>
              <p style={{ color: 'var(--ed-text-dim)', fontSize: 11, marginTop: 4 }}>
                اختر نقطة على الصورة بالماوس. هذه خوارزمية كلاسيكية (ليست AI) تعتمد على تشابه اللون.
              </p>
              <button style={BTN.dim} onClick={() => alert('اضغط على الصورة لتحديد نقطة البداية. هذه ميزة كلاسيكية.')}>فهمت</button>
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--ed-text-dim)', lineHeight: 1.8, borderTop: '1px solid var(--ed-border)', paddingTop: 8 }}>
            ترتيب المعالجة النهائي: توسيع ← خام (GPU) ← ريتوش ← تأثيرات ← تكبير عصبي.
            كل شيء غير تدميري حتى الضغط على «تطبيق»، والتطبيق يسجّل الخطوة في تاريخ المحرر الأصلي.
          </div>
        </div>
      </div>
    </Overlay>
  )
}

// ---------------- viewer helpers ----------------

function SplitSlider({ value, onChange }: { value: number; onChange: (v: number) => void }): React.ReactNode {
  const [dragging, setDragging] = useState(false)
  const onMove = useCallback((clientX: number): void => {
    const host = document.querySelector('[data-studio-split-host]') as HTMLElement | null
    if (!host) return
    const rect = host.getBoundingClientRect()
    onChange(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)))
  }, [onChange])
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent): void => onMove(e.clientX)
    const stop = (): void => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [dragging, onMove])
  return (
    <div
      style={{ position: 'absolute', top: 0, bottom: 0, left: `${value}%`, width: 4, cursor: 'ew-resize', background: 'var(--ed-accent, #7c5cff)', borderRadius: 2 }}
      onPointerDown={(e) => { e.stopPropagation(); setDragging(true); onMove(e.clientX) }}
    />
  )
}

// ---------------- sidebar bodies ----------------

const SECTION_TITLES: Record<'light' | 'color' | 'detail' | 'optics', { ar: string; en: string }> = {
  light: { ar: 'الإضاءة', en: 'Light' },
  color: { ar: 'اللون', en: 'Color' },
  detail: { ar: 'التفاصيل', en: 'Detail' },
  optics: { ar: 'البصريات والتشطيب', en: 'Optics & finishing' },
}

function RawTab({ params, onChange, onPreset }: {
  params: StudioParams
  onChange: (key: StudioParamKey, v: number) => void
  onPreset: (id: PresetId) => void
}): React.ReactNode {
  const sections = (['light', 'color', 'detail', 'optics'] as const).map((id) => ({
    id,
    keys: CONTROL_ORDER.filter((key) => SECTION_OF[key] === id),
  }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={sectionTitle}>أنماط جاهزة — Presets</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {PRESETS.map((p) => (
            <button key={p.id} style={BTN.dim} onClick={() => onPreset(p.id)} title={p.nameEn}>{p.label}</button>
          ))}
        </div>
      </div>
      {sections.map((sec) => (
        <div key={sec.id}>
          <div style={sectionTitle}>{SECTION_TITLES[sec.id].ar} — <span style={{ fontSize: 10 }}>{SECTION_TITLES[sec.id].en}</span></div>
          {sec.keys.map((key) => {
            const spec = CONTROLS[key]
            const label = CONTROL_LABELS[key]
            return (
              <div key={key} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ed-text-dim)' }}>
                  <span>{label.ar} <span style={{ fontSize: 10 }}>{label.en}</span></span>
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type="number"
                      value={params[key]}
                      step={spec.step}
                      min={spec.min}
                      max={spec.max}
                      onChange={(e) => onChange(key, Number(e.target.value))}
                      style={{ ...inputBase, width: 74, padding: '2px 4px' }}
                    />
                    <button style={{ ...BTN.dim, padding: '2px 5px' }} title="إرجاع هذه القيمة للافتراضي" onClick={() => onChange(key, spec.reset)}>
                      <RotateCcw size={11} />
                    </button>
                  </span>
                </div>
                <input
                  type="range"
                  value={params[key]}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  onChange={(e) => onChange(key, Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--ed-accent)', marginTop: 3 }}
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function RetouchTab({ retouch, onChange }: {
  retouch: RetouchState
  onChange: (key: keyof RetouchState, v: number) => void
}): React.ReactNode {
  const rows: { key: keyof RetouchState; ar: string; en: string }[] = [
    { key: 'smoothing', ar: 'تنعيم البشرة', en: 'Skin smoothing' },
    { key: 'texturePreserve', ar: 'حفظ الملمس', en: 'Texture preservation' },
    { key: 'denoise', ar: 'إزالة الضجيج', en: 'Noise reduction' },
    { key: 'sharpen', ar: 'حدة انتقائية', en: 'Selective sharpening' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ed-text-dim)' }}>
            <span>{r.ar} <span style={{ fontSize: 10 }}>{r.en}</span></span>
            <b style={{ color: 'var(--ed-text)' }}>{retouch[r.key].toFixed(2)}</b>
          </div>
          <input
            type="range" min={0} max={1} step={0.01} value={retouch[r.key]}
            onChange={(e) => onChange(r.key, Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--ed-accent)', marginTop: 3 }}
          />
        </div>
      ))}
      <div style={{ fontSize: 10, color: 'var(--ed-text-dim)', lineHeight: 1.8 }}>
        التنعيم يقلّل التباين في المناطق الملساء فقط ويحافظ على الملمس والحواف — أول متغير تبايني محلي يعطي معامل صلابة.
      </div>
      <div style={{ fontSize: 10, color: 'var(--ed-text-dim)', lineHeight: 1.8 }}>
        مستشفيات الوجه التعلمية (GFPGAN / CodeFormer) تتطلب خدمة خلفية بنماذج GPU — غير مهيأة في هذه النسخة، لذلك لا توجد أزرار لمنتجة هنا.
      </div>
    </div>
  )
}

const EFFECT_ITEMS: { id: EffectKind; ar: string }[] = [
  { id: 'sketch', ar: 'رسمة قلم' },
  { id: 'grayscaleSketch', ar: 'رمادي' },
  { id: 'lineArt', ar: 'رسم خطوط' },
  { id: 'ink', ar: 'حبر أسود' },
  { id: 'stencil', ar: 'ستيبل' },
  { id: 'cartoon', ar: 'كرتوني' },
]

function EffectsTab({ effect, setEffect }: { effect: EffectState; setEffect: React.Dispatch<React.SetStateAction<EffectState>> }): React.ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        <button style={effect.kind === 'none' ? BTN.active : BTN.dim} onClick={() => setEffect({ kind: 'none', strength: 1, level: 0.5 })}>
          <ImagePlus size={13} style={{ verticalAlign: 'middle', marginLeft: 4 }} /> بلا تأثير
        </button>
        {EFFECT_ITEMS.map((e) => (
          <button key={e.id} style={effect.kind === e.id ? BTN.active : BTN.dim} onClick={() => setEffect({ kind: e.id, strength: 1, level: 0.5 })}>{e.ar}</button>
        ))}
      </div>
      {effect.kind !== 'none' && (
        <>
          <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>
            القوة: <b style={{ color: 'var(--ed-text)' }}>{effect.strength.toFixed(2)}</b>
            <input type="range" min={0} max={1} step={0.01} value={effect.strength} onChange={(e) => setEffect((s) => ({ ...s, strength: Number(e.target.value) }))} style={{ width: '100%', accentColor: 'var(--ed-accent)' }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>
            التفصيل: <b style={{ color: 'var(--ed-text)' }}>{effect.level.toFixed(2)}</b>
            <input type="range" min={0} max={1} step={0.01} value={effect.level} onChange={(e) => setEffect((s) => ({ ...s, level: Number(e.target.value) }))} style={{ width: '100%', accentColor: 'var(--ed-accent)' }} />
          </label>
          <div style={{ fontSize: 10, color: 'var(--ed-text-dim)', lineHeight: 1.8 }}>
            هذه فلاتر كلاسيكية حقيقية (dodge-blend، Sobel، عتبة، تلوين مسطح) — ليست نماذج توليد.
          </div>
        </>
      )}
    </div>
  )
}

function ExpandTab({ expand, setExpand, onEdge, previewRef }: {
  expand: ExpandState
  setExpand: React.Dispatch<React.SetStateAction<ExpandState>>
  onEdge: (key: 'top' | 'right' | 'bottom' | 'left', v: number) => void
  previewRef: React.RefObject<HTMLCanvasElement | null>
}): React.ReactNode {
  const edges: { key: 'top' | 'right' | 'bottom' | 'left'; ar: string; en: string }[] = [
    { key: 'top', ar: 'من الأعلى', en: 'Top' },
    { key: 'right', ar: 'من اليمين', en: 'Right' },
    { key: 'bottom', ar: 'من الأسفل', en: 'Bottom' },
    { key: 'left', ar: 'من اليسار', en: 'Left' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={expand.unit === 'percent' ? BTN.active : BTN.dim} onClick={() => setExpand((e) => ({ ...e, unit: 'percent' }))}>%</button>
        <button style={expand.unit === 'pixels' ? BTN.active : BTN.dim} onClick={() => setExpand((e) => ({ ...e, unit: 'pixels' }))}>px</button>
      </div>
      {edges.map((e) => (
        <div key={e.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ed-text-dim)' }}>
            <span>{e.ar} <span style={{ fontSize: 10 }}>{e.en}</span></span>
            <b style={{ color: 'var(--ed-text)' }}>{expand[e.key]}{expand.unit === 'percent' ? '%' : 'px'}</b>
          </div>
          <input
            type="range"
            min={0}
            max={expand.unit === 'percent' ? 100 : 1200}
            step={expand.unit === 'percent' ? 1 : 8}
            value={expand[e.key]}
            onChange={(ev) => onEdge(e.key, Number(ev.target.value))}
            style={{ width: '100%', accentColor: 'var(--ed-accent)', marginTop: 3 }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={expand.mode === 'mirror' ? BTN.active : BTN.dim} onClick={() => setExpand((e) => ({ ...e, mode: 'mirror' }))}>تمديد مرآتي (سريع)</button>
        <button style={expand.mode === 'replicate' ? BTN.active : BTN.dim} onClick={() => setExpand((e) => ({ ...e, mode: 'replicate' }))}>حسب الحواف (سريع)</button>
      </div>
      <div style={{ fontSize: 10, color: '#d97706', lineHeight: 1.8 }}>{GENERATIVE_EXPAND_BLOCKED}</div>
      <canvas ref={previewRef} style={{ ...checkerStyle(), width: '100%', border: '1px solid var(--ed-border)', borderRadius: 8 }} />
    </div>
  )
}

function NeuralTab({ neural, onModel, onRun }: { neural: NeuralState; onModel: (id: string) => void; onRun: () => void }): React.ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <select style={inputBase} value={neural.modelId} onChange={(e) => onModel(e.target.value)} disabled={neural.running}>
        {NEURAL_MODELS.map((m: NeuralModelDescriptor) => (
          <option key={m.id} value={m.id}>{m.label} — {m.scale}× {m.illustrativeHint ?? ''}</option>
        ))}
      </select>
      <button style={BTN.primary} onClick={onRun} disabled={neural.running}>
        {neural.running ? <Loader2 size={14} /> : <Wand2 size={14} />} {neural.running ? `جارٍ الاستدلال… ${neural.progress}%` : 'تشغيل الاستدلال (ONNX)'}
      </button>
      {neural.running && (
        <div style={{ height: 6, borderRadius: 999, background: 'var(--ed-border)' }}>
          <div style={{ height: '100%', width: `${neural.progress}%`, background: 'var(--ed-accent, #7c5cff)', borderRadius: 999 }} />
        </div>
      )}
      {neural.error && <div style={{ fontSize: 11, color: '#ef4444', whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{neural.error}</div>}
      {neural.done && (
        <div style={{ fontSize: 11, color: 'var(--ed-text-dim)', lineHeight: 1.8 }}>
          نجح الاستدلال: {neural.outW}×{neural.outH} خلال {neural.ms} مللي ثانية (ONNX Runtime Web).
          ستُستخدم النتيجة عند التطبيق والتصدير كاملة الدقة.
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--ed-text-dim)', lineHeight: 1.8 }}>
        استدلال شبكة عصبي حقيقي يتطلب ملف أوزان Real-ESRGAN بصيغة ONNX على الخادم في المسار
        <code style={{ userSelect: 'all', direction: 'ltr' }}> /media/models/real-esrgan/ </code>
        (نفس آلية نماذج إزالة الخلفية). إن لم يوجد الملف سترى رسالة صريحة — لا يوجد استبدال خفي بتكبير تقليدي وصفه بأنه AI.
      </div>
    </div>
  )
}

// ---------------- atoms ----------------

function Overlay({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  )
}

function CenterNote({ text }: { text: string }): React.ReactNode {
  return <div style={{ color: 'var(--ed-text)', fontSize: 14 }}>{text}</div>
}

const panelStyle: React.CSSProperties = {
  background: 'var(--ed-surface)', border: '1px solid var(--ed-border)', borderRadius: 'var(--ed-radius-md, 12px)',
  width: '94vw', maxWidth: 1160, height: '92vh', maxHeight: 920, display: 'flex', overflow: 'hidden',
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)', color: 'var(--ed-text)',
}

const inputBase: React.CSSProperties = {
  background: 'var(--ed-surface-3, #1b1e26)', border: '1px solid var(--ed-border)', borderRadius: 6,
  color: 'var(--ed-text)', fontSize: 12, width: '100%', boxSizing: 'border-box',
}

const sectionTitle: React.CSSProperties = {
  fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--ed-text-dim)', marginBottom: 8,
}

const BTN: Record<'primary' | 'dim' | 'active', React.CSSProperties> = {
  primary: {
    padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--ed-accent, #7c5cff)',
    color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12,
  },
  dim: {
    padding: '6px 10px', borderRadius: 6, border: '1px solid var(--ed-border)',
    background: 'var(--ed-surface-3, #1b1e26)', color: 'var(--ed-text)', cursor: 'pointer', fontSize: 12,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  },
  active: {
    padding: '6px 10px', borderRadius: 6, border: '1px solid var(--ed-accent, #7c5cff)',
    background: 'color-mix(in srgb, var(--ed-accent, #7c5cff) 16%, transparent)',
    color: 'var(--ed-text)', cursor: 'pointer', fontSize: 12,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  },
}
