/**
 * Camera Raw Studio Modal — live-preview, Doory-themed.
 * All adjustments re-render from a pristine source (non-destructive), debounced for smooth sliders.
 * Lazy-loaded; never included in the initial editor bundle.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { ZoomIn, Maximize2, Pencil, Download, X, Camera, RotateCcw } from 'lucide-react'
import { useEditor, useEditorState } from '../context'
import { applyRawAdjustments, type RawAdjustments } from '../engine/cameraRawEngine'
import { upscaleImage, type UpscaleOptions } from '../engine/upscaleEngine'
import { expandCanvas, type ExpandOptions } from '../engine/aiOutpaint'
import { toPencilSketch } from '../engine/sketchEngine'

const DEFAULT_ADJ: RawAdjustments = {
  exposure: 0, contrast: 1, highlights: 0, shadows: 0,
  saturation: 1, vibrance: 1, sharpness: 0,
}

/** Longest side of the live-preview source; keeps per-slider rerenders cheap. */
const PREVIEW_MAX = 800

function drawPlaceholder(el: HTMLCanvasElement) {
  const ctx = el.getContext('2d')
  if (!ctx) return
  el.width = 640; el.height = 480
  ctx.fillStyle = '#121418'; ctx.fillRect(0, 0, 640, 480)
  ctx.strokeStyle = '#23262d'; ctx.lineWidth = 1
  for (let x = 0; x < 640; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke() }
  for (let y = 0; y < 480; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke() }
  ctx.fillStyle = '#8b92a8'; ctx.font = '14px system-ui'; ctx.textAlign = 'center'
  ctx.fillText('Select an image or apply adjustments', 320, 240)
}

/** Downscale `source` into a canvas whose longest side is at most `max`. */
function downscale(source: HTMLCanvasElement | HTMLImageElement, max: number): HTMLCanvasElement {
  const sw = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth
  const sh = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight
  const k = Math.min(1, max / Math.max(sw, sh))
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(sw * k))
  out.height = Math.max(1, Math.round(sh * k))
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, out.width, out.height)
  return out
}

export default function CameraRawStudioModal({ onClose }: { onClose: () => void }) {
  const editor = useEditor()
  const [adj, setAdj] = useState<RawAdjustments>({ ...DEFAULT_ADJ })
  const [upscale, setUpscale] = useState<UpscaleOptions>({ scale: 2, sharpening: 0.8 })
  const [expand, setExpand] = useState<ExpandOptions>({ percent: 20, mode: 'mirror' })
  const [sketch, setSketch] = useState(false)
  const [progress, setProgress] = useState(0)
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const selection = useEditorState((s) => s.selection)
  const doc = useEditorState((s) => s.doc)
  const activePageId = useEditorState((s) => s.activePageId)

  // Pristine (unmodified) sources: full-res for export/apply, downscaled for live preview.
  const originalRef = useRef<HTMLCanvasElement | null>(null)
  const originalDataRef = useRef<ImageData | null>(null)
  const previewDataRef = useRef<ImageData | null>(null)
  const debounceRef = useRef<number | null>(null)

  /** Paints the pristine downscaled pixels + current adjustments into the visible canvas. */
  const renderLive = useCallback((withSketch: boolean, a: RawAdjustments) => {
    const el = previewRef.current
    const src = previewDataRef.current
    if (!el || !src) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    el.width = src.width
    el.height = src.height
    const copy = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
    applyRawAdjustments(copy, a)
    ctx.putImageData(copy, 0, 0)
    if (withSketch) {
      const sk = toPencilSketch(el)
      ctx.clearRect(0, 0, el.width, el.height)
      ctx.drawImage(sk, 0, 0)
    }
  }, [])

  /** Debounced live render — one pipeline run per gesture, not per pixel of slider travel. */
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => renderLive(sketch, adj), 60)
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [adj, sketch, renderLive])

  /** Takes a loaded canvas as the new pristine source and renders it. */
  const adopt = useCallback((canvas: HTMLCanvasElement) => {
    const octx = canvas.getContext('2d', { willReadFrequently: true })
    if (!octx) return
    originalRef.current = canvas
    originalDataRef.current = octx.getImageData(0, 0, canvas.width, canvas.height)
    const small = downscale(canvas, PREVIEW_MAX)
    previewDataRef.current = small.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, small.width, small.height)
    renderLive(sketch, adj)
  }, [adj, sketch, renderLive])

  // Load the selected image (or the active page as fallback) as the pristine source
  useEffect(() => {
    let cancelled = false

    const imgObj = selection.objects?.find((o) => o.type === 'image')
    const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0]
    const bg = page?.background
    const rawSrc = imgObj
      ? (imgObj.src as string | undefined)
      : bg?.type === 'image' ? bg.src : undefined

    const finish = (img: HTMLImageElement) => {
      if (cancelled) return
      const c = document.createElement('canvas')
      c.width = img.naturalWidth || 640
      c.height = img.naturalHeight || 480
      c.getContext('2d')!.drawImage(img, 0, 0)
      adopt(c)
    }

    if (rawSrc) {
      editor.assets
        .resolve(rawSrc)
        .catch(() => rawSrc)
        .then((url) => {
          if (cancelled) return
          if (!url) { drawPlaceholder(previewRef.current!); return }
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => finish(img)
          img.onerror = () => { if (!cancelled) drawPlaceholder(previewRef.current!) }
          img.src = url
        })
    } else if (page) {
      const size = editor.pageSizeOf(page.id)
      const interest = new AbortController()
      editor.snapshots
        .get(page, { width: size.width, height: size.height }, interest.signal)
        .then((url) => {
          if (cancelled) return
          if (!url) { drawPlaceholder(previewRef.current!); return }
          const img = new Image()
          img.onload = () => finish(img)
          img.onerror = () => { if (!cancelled) drawPlaceholder(previewRef.current!) }
          img.src = url
        })
        .catch(() => { if (!cancelled) drawPlaceholder(previewRef.current!) })
      return () => { cancelled = true; interest.abort() }
    } else {
      drawPlaceholder(previewRef.current!)
    }
    return () => { cancelled = true }
  }, [editor, selection, doc, activePageId, adopt])

  /** Bakes the current adjustments into the full-resolution source and shows it. */
  const applyFullRes = useCallback(() => {
    const el = previewRef.current
    const orig = originalDataRef.current
    if (!el || !orig) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    el.width = orig.width
    el.height = orig.height
    const copy = new ImageData(new Uint8ClampedArray(orig.data), orig.width, orig.height)
    applyRawAdjustments(copy, adj)
    ctx.putImageData(copy, 0, 0)
    if (sketch) {
      const sk = toPencilSketch(el)
      ctx.clearRect(0, 0, el.width, el.height)
      ctx.drawImage(sk, 0, 0)
    }
  }, [adj, sketch])

  /** Cancels every adjustment and restores the pristine source. */
  const resetAll = useCallback(() => {
    setAdj({ ...DEFAULT_ADJ })
    setSketch(false)
    renderLive(false, { ...DEFAULT_ADJ })
  }, [renderLive])

  const runUpscale = useCallback(async () => {
    const orig = originalRef.current
    if (!orig) return
    setProgress(10)
    const result = await upscaleImage(orig, upscale, (p) => setProgress(p))
    adopt(result)
    setProgress(0)
  }, [upscale, adopt])

  const runExpand = useCallback(async () => {
    const orig = originalRef.current
    if (!orig) return
    adopt(expandCanvas(orig, expand))
  }, [expand, adopt])

  const slider = (label: string, key: string, min: number, max: number, step: number) => (
    <label key={key} style={{ display: 'block', fontSize: 12, color: 'var(--ed-text-dim)', marginBottom: 10 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <b style={{ color: 'var(--ed-text)' }}>{(adj as unknown as Record<string, number>)[key].toFixed(2)}</b>
      </span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={(adj as unknown as Record<string, number>)[key]}
        onChange={e => setAdj({ ...adj, [key]: Number(e.target.value) })}
        style={{ width: '100%', accentColor: 'var(--ed-accent)', marginTop: 4 }}
      />
    </label>
  )

  const btn = (active: boolean): React.CSSProperties => ({
    padding: 6, borderRadius: 6,
    border: active ? '1px solid var(--ed-accent)' : '1px solid var(--ed-border)',
    background: 'var(--ed-surface-3)', color: 'var(--ed-text)', cursor: 'pointer',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--ed-surface)', border: '1px solid var(--ed-border)', borderRadius: 'var(--ed-radius-md)', width: '92vw', maxWidth: 1080, maxHeight: '92vh', display: 'flex', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.4)' }}>
        {/* Side panel */}
        <div style={{ width: 300, minWidth: 260, padding: 20, overflowY: 'auto', borderRight: '1px solid var(--ed-border)', background: 'var(--ed-surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ed-text)', margin: 0 }}>
              <Camera size={18} /> Camera Raw Studio
            </h2>
            <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--ed-text-dim)', cursor: 'pointer' }}><X size={18} /></button>
          </div>

          <section style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--ed-text-dim)', marginBottom: 10 }}>Raw Adjustments — live</h3>
            {slider('Exposure', 'exposure', -2, 2, 0.1)}
            {slider('Contrast', 'contrast', 0, 3, 0.1)}
            {slider('Highlights', 'highlights', -1, 1, 0.05)}
            {slider('Shadows', 'shadows', -1, 1, 0.05)}
            {slider('Saturation', 'saturation', 0, 3, 0.1)}
            {slider('Vibrance', 'vibrance', 0, 2, 0.05)}
            {slider('Sharpness', 'sharpness', 0, 3, 0.1)}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={applyFullRes} style={{ flex: 1, padding: 8, borderRadius: 'var(--ed-radius-sm)', border: 'none', background: 'var(--ed-accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Full Quality</button>
              <button onClick={resetAll} title="Reset all adjustments" style={{ padding: '8px 12px', borderRadius: 'var(--ed-radius-sm)', border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', cursor: 'pointer' }}><RotateCcw size={15} /></button>
            </div>
          </section>

          <section style={{ marginBottom: 18, paddingTop: 14, borderTop: '1px solid var(--ed-border)' }}>
            <h3 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--ed-text-dim)', marginBottom: 10 }}>AI Upscale</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => setUpscale({ ...upscale, scale: 2 })} style={btn(upscale.scale === 2)}>2x</button>
              <button onClick={() => setUpscale({ ...upscale, scale: 4 })} style={btn(upscale.scale === 4)}>4x</button>
            </div>
            <label style={{ fontSize: 12, color: 'var(--ed-text-dim)', display: 'block', marginBottom: 4 }}>Sharpening: <b style={{ color: 'var(--ed-text)' }}>{upscale.sharpening}</b></label>
            <input type="range" min={0} max={2} step={0.1} value={upscale.sharpening} onChange={e => setUpscale({ ...upscale, sharpening: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--ed-accent)' }} />
            <button onClick={() => void runUpscale()} style={{ width: '100%', marginTop: 8, padding: 8, borderRadius: 'var(--ed-radius-sm)', border: 'none', background: 'var(--ed-accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}><ZoomIn size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Run Upscale {upscale.scale}x</button>
          </section>

          <section style={{ marginBottom: 18, paddingTop: 14, borderTop: '1px solid var(--ed-border)' }}>
            <h3 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--ed-text-dim)', marginBottom: 10 }}>AI Outpaint / Expand</h3>
            <label style={{ fontSize: 12, color: 'var(--ed-text-dim)', display: 'block', marginBottom: 4 }}>Expand: <b style={{ color: 'var(--ed-text)' }}>{expand.percent}%</b></label>
            <input type="range" min={10} max={50} step={5} value={expand.percent} onChange={e => setExpand({ ...expand, percent: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--ed-accent)' }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {['mirror', 'replicate', 'patch'].map(m => (
                <button key={m} onClick={() => setExpand({ ...expand, mode: m as ExpandOptions['mode'] })} style={{ ...btn(expand.mode === m), flex: 1, fontSize: 11, textTransform: 'capitalize' }}>{m}</button>
              ))}
            </div>
            <button onClick={runExpand} style={{ width: '100%', marginTop: 8, padding: 8, borderRadius: 'var(--ed-radius-sm)', border: 'none', background: '#2aa198', color: '#fff', fontWeight: 600, cursor: 'pointer' }}><Maximize2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Expand Design</button>
          </section>

          <section style={{ paddingTop: 14, borderTop: '1px solid var(--ed-border)' }}>
            <h3 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--ed-text-dim)', marginBottom: 10 }}>Sketch Stylization</h3>
            <button onClick={() => setSketch(s => !s)} style={{ width: '100%', padding: 8, borderRadius: 'var(--ed-radius-sm)', border: 'none', background: sketch ? 'var(--ed-accent)' : 'var(--ed-surface-3)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}><Pencil size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> {sketch ? 'Disable Sketch' : 'Apply Sketch'}</button>
          </section>
        </div>

        {/* Preview */}
        <div style={{ flex: 1, background: 'var(--ed-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
          <canvas ref={previewRef} style={{ maxWidth: '100%', maxHeight: '68vh', borderRadius: 'var(--ed-radius-md)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', border: '1px solid var(--ed-border)', background: 'var(--ed-surface-2)' }} />
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
            <button onClick={() => { const c = previewRef.current; if (!c) return; const link = document.createElement('a'); link.download = 'edited.png'; link.href = c.toDataURL(); link.click() }} style={{ padding: '6px 14px', borderRadius: 'var(--ed-radius-sm)', border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', cursor: 'pointer', fontWeight: 500 }}><Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Export PNG</button>
          </div>
          {progress > 0 && <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--ed-accent)', color: '#fff', padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{Math.round(progress)}%</div>}
        </div>
      </div>
    </div>
  )
}
