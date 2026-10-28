/**
 * "Refine Cutout Studio" — the interactive mask-refinement editor of the Sticker
 * Studio. Part of the lazily loaded Sticker Studio chunk, never the editor bundle.
 *
 * The untouched source pixels stay in `source`; every erase/restore brush stroke
 * edits only the alpha (and, for restore, the original colour) of `working`. The
 * preview composites working → edge choke/feather → die-cut border on every frame.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, ImagePlus, Paintbrush, Save, Wand2, X } from 'lucide-react'
import { useEditor } from '../../context'
import { isBackgroundRemovalAvailable } from '@/editor/engine/bgRemoval'
import {
  applyDieCutBorder,
  applyEdgeControls,
  autoCropTransparentBounds,
  blobToPixelBuffer,
  brushStroke,
  neuralCutout,
  pixelBufferToPngDataUrl,
  studioCutout,
  toImageData,
  autoDetectMode,
  type BrushMode,
  type CutoutMode,
  type CutoutPhase,
  type PixelBuffer,
} from '@/lib/ai/stickerCutout'
import { addSticker } from '@/lib/storage/stickerVault'
import styles from './StickerStudioModal.module.css'

/** Scales `buffer` onto an exact pixel grid (a neural pass may come back resized). */
function resizeBufferTo(buffer: PixelBuffer, width: number, height: number): PixelBuffer {
  if (buffer.width === width && buffer.height === height) return buffer
  const src = document.createElement('canvas')
  src.width = buffer.width
  src.height = buffer.height
  const srcCtx = src.getContext('2d')
  if (!srcCtx) return buffer
  srcCtx.putImageData(toImageData(buffer), 0, 0)
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const outCtx = out.getContext('2d', { willReadFrequently: true })
  if (!outCtx) return buffer
  outCtx.drawImage(src, 0, 0, width, height)
  const image = outCtx.getImageData(0, 0, width, height)
  return { data: image.data, width, height }
}

function dataUrlToFile(dataUrl: string, name: string): File {
  const comma = dataUrl.indexOf(',')
  const b64 = dataUrl.slice(comma + 1)
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], `${name}.png`, { type: 'image/png' })
}

interface StudioState {
  source: PixelBuffer
  working: PixelBuffer
  mode: CutoutMode
  brush: BrushMode
  brushSize: number
  softness: number
  choke: number
  feather: number
  borderPx: number
  borderColor: string
  shadow: boolean
  backdrop: 'checker' | 'black' | 'magenta'
  name: string
  category: string
}

export interface RefineCanvasProps {
  file: File
  defaults: {
    mode: CutoutMode | 'auto'
    tolerance: number
    edgeChoke: number
    edgeFeather: number
    borderPx: number
    borderColor: string
    borderShadow: boolean
  }
  category: string
  onClose(): void
  /** Fired after the sticker is saved into the vault. */
  onSaved(): void
}

export function RefineCanvas({ file, defaults, category, onClose, onSaved }: RefineCanvasProps) {
  const editor = useEditor()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const studioRef = useRef<StudioState | null>(null)
  const paintingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const frameRef = useRef<number | null>(null)
  const [studio, setStudio] = useState<StudioState | null>(null)
  const [phase, setPhase] = useState<CutoutPhase | null>('loading')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [detected, setDetected] = useState<CutoutMode | null>(null)
  const [name, setName] = useState(() => file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Sticker')

  useEffect(() => {
    studioRef.current = studio
  }, [studio])

  const patch = useCallback((next: Partial<StudioState>): void => {
    setStudio((prev) => (prev ? { ...prev, ...next } : prev))
  }, [])

  const renderStudio = useCallback((): void => {
    const state = studioRef.current
    const canvas = canvasRef.current
    if (!state || !canvas) return
    let buffer = applyEdgeControls(state.working, state.choke, state.feather)
    if (state.borderPx > 0 || state.shadow) {
      buffer = applyDieCutBorder(buffer, { borderPx: state.borderPx, color: state.borderColor, shadow: state.shadow })
    }
    canvas.width = buffer.width
    canvas.height = buffer.height
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.putImageData(toImageData(buffer), 0, 0)
  }, [])

  const scheduleRender = useCallback((): void => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      renderStudio()
    })
  }, [renderStudio])

  useEffect(() => {
    scheduleRender()
  }, [studio?.choke, studio?.feather, studio?.borderPx, studio?.borderColor, studio?.shadow, scheduleRender])

  // Decode + first cutout on mount.
  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    void (async () => {
      try {
        const buffer = await blobToPixelBuffer(file, 1600, controller.signal)
        if (!alive) return
        const sample = autoDetectMode(buffer, defaults.tolerance)
        setDetected(sample)
        setPhase('matting')
        setPercent(30)
        const useNeural =
          defaults.mode === 'neural' ||
          (defaults.mode === 'auto' && sample === 'neural' && isBackgroundRemovalAvailable())
        let base: PixelBuffer
        if (useNeural) {
          setPhase('segmenting')
          try {
            base = await neuralCutout(file, controller.signal, (p, value) => {
              setPhase(p)
              setPercent(value)
            })
            base = resizeBufferTo(base, buffer.width, buffer.height)
          } catch {
            if (controller.signal.aborted) return
            base = studioCutout(buffer, { tolerance: defaults.tolerance, edgeFeather: 1 })
          }
        } else {
          base = studioCutout(buffer, { tolerance: defaults.tolerance, edgeFeather: 1 })
        }
        if (!alive || controller.signal.aborted) return
        const state: StudioState = {
          source: buffer,
          working: { data: new Uint8ClampedArray(base.data), width: base.width, height: base.height },
          mode: useNeural ? 'neural' : 'studio',
          brush: 'erase',
          brushSize: 28,
          softness: 55,
          choke: defaults.edgeChoke,
          feather: defaults.edgeFeather,
          borderPx: defaults.borderPx,
          borderColor: defaults.borderColor,
          shadow: defaults.borderShadow,
          backdrop: 'checker',
          name,
          category,
        }
        studioRef.current = state
        setStudio(state)
        setPhase(null)
        setPercent(0)
      } catch (loadError) {
        if (!alive || controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : 'Could not load the image.')
        setPhase(null)
      }
    })()
    return () => {
      alive = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one cutout per opened file
  }, [file])

  /* -------------------------------------------------------------- painting */

  const toBufferPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current
    const state = studioRef.current
    if (!canvas || !state) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * state.working.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * state.working.height,
    }
  }, [])

  const strokeSegment = useCallback((from: { x: number; y: number }, to: { x: number; y: number }): void => {
    const state = studioRef.current
    if (!state) return
    const radius = state.brushSize / 2
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, state.brushSize * 0.25)))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      brushStroke(state.working, state.source, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius, state.softness / 100, state.brush)
    }
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): void => {
      const state = studioRef.current
      if (!state || event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      paintingRef.current = true
      const point = toBufferPoint(event)
      lastPointRef.current = point
      strokeSegment(point, point)
      scheduleRender()
    },
    [toBufferPoint, strokeSegment, scheduleRender],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): void => {
      if (!paintingRef.current) return
      const point = toBufferPoint(event)
      const last = lastPointRef.current ?? point
      strokeSegment(last, point)
      lastPointRef.current = point
      scheduleRender()
    },
    [toBufferPoint, strokeSegment, scheduleRender],
  )

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): void => {
      if (!paintingRef.current) return
      paintingRef.current = false
      const point = toBufferPoint(event)
      const last = lastPointRef.current
      if (last) strokeSegment(last, point)
      lastPointRef.current = null
      scheduleRender()
    },
    [toBufferPoint, strokeSegment, scheduleRender],
  )

  /* --------------------------------------------------------- save / insert */

  const buildPng = useCallback((): { dataUrl: string; width: number; height: number } | null => {
    const state = studioRef.current
    if (!state) return null
    let buffer = applyEdgeControls(state.working, state.choke, state.feather)
    if (state.borderPx > 0 || state.shadow) {
      buffer = applyDieCutBorder(buffer, { borderPx: state.borderPx, color: state.borderColor, shadow: state.shadow })
    }
    const cropped = autoCropTransparentBounds(buffer, 1)
    return { dataUrl: pixelBufferToPngDataUrl(cropped), width: cropped.width, height: cropped.height }
  }, [])

  const saveToVault = useCallback(async (): Promise<void> => {
    const state = studioRef.current
    if (!state) return
    setSaving(true)
    try {
      const png = buildPng()
      if (!png) return
      await addSticker({ name: state.name, category: state.category, dataUrl: png.dataUrl, width: png.width, height: png.height, tags: [state.mode] })
      editor.toast('Sticker saved to your vault · تم الحفظ', 'success')
      onSaved()
    } catch {
      editor.toast('Could not save the sticker', 'error')
    } finally {
      setSaving(false)
    }
  }, [editor, buildPng, onSaved])

  const insertToCanvas = useCallback(async (): Promise<void> => {
    const state = studioRef.current
    if (!state) return
    try {
      const png = buildPng()
      if (!png) return
      await editor.insert.imageFiles([dataUrlToFile(png.dataUrl, state.name)])
      onClose()
    } catch {
      editor.toast('Could not insert the sticker', 'error')
    }
  }, [editor, buildPng, onClose])

  /* ---------------------------------------------------------------- render */

  const state = studio

  return (
    <div className={styles.studio} data-testid="refine-studio">
      <div className={styles.canvasCol}>
        <div className={styles.row}>
          <div className={styles.backdropRow} role="group" aria-label="Preview backdrop">
            {(
              [
                { id: 'checker', className: styles.checkerBtn, label: 'Checkerboard' },
                { id: 'black', className: styles.blackBtn, label: 'Matte black' },
                { id: 'magenta', className: styles.magentaBtn, label: 'Magenta' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.backdropBtn} ${option.className} ${state?.backdrop === option.id ? styles.backdropBtnActive : ''}`}
                title={option.label}
                aria-label={option.label}
                aria-pressed={state?.backdrop === option.id}
                onClick={() => patch({ backdrop: option.id })}
              />
            ))}
          </div>
          <span className={styles.hint}>
            {state ? `الوضع: ${state.mode === 'neural' ? 'ذكي AI' : 'استوديو'}${detected ? ` (auto: ${detected})` : ''} · ${state.working.width}×${state.working.height}` : ''}
          </span>
        </div>
        <div
          className={`${styles.canvasWrap} ${state?.backdrop === 'checker' ? styles.checker : state?.backdrop === 'black' ? styles.matteBlack : styles.magenta}`}
        >
          {state ? (
            <canvas
              ref={canvasRef}
              data-testid="refine-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          ) : (
            <div className={styles.hint}>{error ?? '…'}</div>
          )}
          {phase !== null && (
            <div className={styles.saving} data-testid="refine-phase">
              <div>{phase === 'loading' ? 'تحميل… · Loading' : phase === 'segmenting' ? 'قص ذكي… · Segmenting' : 'قص استوديو… · Matting'}</div>
              <div className={styles.progressBar} style={{ width: 160 }}>
                <div className={styles.progressFill} style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className={styles.hint}>امسح أو أعد الرسم بالفرشاة، ثم احفظ أو أدرج · Erase/Restore, then save or insert</div>
      </div>

      <div>
        <div className={styles.toolRow}>
          <button type="button" className={state?.brush === 'erase' ? styles.brushBtnActive : styles.brushBtn} data-testid="brush-erase" onClick={() => patch({ brush: 'erase' })}>
            <Eraser size={14} /> Erase · مسح
          </button>
          <button type="button" className={state?.brush === 'restore' ? styles.brushBtnActive : styles.brushBtn} data-testid="brush-restore" onClick={() => patch({ brush: 'restore' })}>
            <Paintbrush size={14} /> Restore · إرجاع
          </button>
        </div>

        <div className={styles.controls}>
          <label className={styles.control}>
            <span className={styles.controlLabel}>حجم الفرشاة / Brush size <b>{state?.brushSize ?? 28}px</b></span>
            <input type="range" min={2} max={120} value={state?.brushSize ?? 28} onChange={(e) => patch({ brushSize: Number(e.target.value) })} />
          </label>
          <label className={styles.control}>
            <span className={styles.controlLabel}>نعومة الفرشاة / Softness <b>{state?.softness ?? 55}%</b></span>
            <input type="range" min={0} max={100} value={state?.softness ?? 55} onChange={(e) => patch({ softness: Number(e.target.value) })} />
          </label>
          <label className={styles.control}>
            <span className={styles.controlLabel}>انكماش الحافة / Edge choke <b>{state?.choke ?? 0}px</b></span>
            <input type="range" min={-10} max={10} value={state?.choke ?? 0} onChange={(e) => patch({ choke: Number(e.target.value) })} />
          </label>
          <label className={styles.control}>
            <span className={styles.controlLabel}>نعومة الحافة / Feather <b>{state?.feather ?? 1}px</b></span>
            <input type="range" min={0} max={10} value={state?.feather ?? 1} onChange={(e) => patch({ feather: Number(e.target.value) })} />
          </label>
          <label className={styles.control}>
            <span className={styles.controlLabel}>حد الديكات / Die-cut border <b>{state?.borderPx ?? 0}px</b></span>
            <input type="range" min={0} max={24} value={state?.borderPx ?? 0} onChange={(e) => patch({ borderPx: Number(e.target.value) })} />
          </label>
          <label className={styles.control}>
            <span className={styles.controlLabel}>لون الحد + الظل / Colour & shadow</span>
            <span className={styles.row}>
              <input type="color" className={styles.colorSwatch} value={state?.borderColor ?? '#ffffff'} onChange={(e) => patch({ borderColor: e.target.value })} aria-label="Die-cut border colour" />
              <label className={styles.hint}>
                <input type="checkbox" checked={state?.shadow ?? false} onChange={(e) => patch({ shadow: e.target.checked })} /> ظل · shadow
              </label>
            </span>
          </label>
        </div>

        <div className={styles.sectionGap}>
          <label className={styles.control}>
            <span className={styles.controlLabel}>الاسم / Name</span>
            <input className={styles.textInput} value={name} onChange={(e) => setName(e.target.value)} data-testid="refine-name" />
          </label>
          <label className={styles.control}>
            <span className={styles.controlLabel}>الفئة / Category</span>
            <input className={styles.textInput} value={state?.category ?? category} onChange={(e) => patch({ category: e.target.value })} data-testid="refine-category" />
          </label>
        </div>

        <div className={styles.row} style={{ marginTop: 12 }}>
          <button type="button" className={styles.btnPrimary} data-testid="refine-save" onClick={() => void saveToVault()} disabled={!state || saving}>
            <Save size={14} /> حفظ · Save
          </button>
          <button type="button" className={styles.btn} data-testid="refine-insert" onClick={() => void insertToCanvas()} disabled={!state}>
            <ImagePlus size={14} /> إدراج · Insert
          </button>
          <button type="button" className={styles.btn} onClick={onClose} aria-label="Close refine studio">
            <X size={14} />
          </button>
          {saving && <Wand2 size={14} className={styles.dropIcon} />}
        </div>
      </div>
    </div>
  )
}
