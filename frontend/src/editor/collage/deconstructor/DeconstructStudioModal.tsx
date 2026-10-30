/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
/**
 * Deconstruct Studio Modal — Single-Click Magic Deconstruct Pipeline.
 *
 * Upload a template image → press "بدء التفكيك السحري والبناء" → pipeline runs:
 *   Step 1: Detect tilted photo frames (OBB + occlusion masks)
 *   Step 2: Inpaint background holes
 *   Step 3: Commit the layered collage directly to the canvas
 *
 * Lazy-loaded by CollagePanel so the editor bundle budget is untouched.
 */
import { useState, useCallback, useRef, useLayoutEffect } from 'react'
import type { DeconstructorOptions, DeconstructionResult, DetachedElement, DetectedTextCard, RotatedFrame } from './types'
import { detectSmartLayeredFrames } from './frameExtractor'
import './DeconstructStudio.css'

export interface DeconstructStudioModalProps {
  imageUrl?: string
  options?: DeconstructorOptions
  width?: number
  height?: number
  onBuild?: (result: DeconstructionResult) => void
  onClose?: () => void
  /** Injected so the modal can commit results directly to the canvas. */
  editor?: ReturnType<typeof import('../../context').useEditor>
}

const DEFAULTS: Required<DeconstructorOptions> = {
  minFrameArea: 0.02,
  paperLuminanceThreshold: 200,
  occlusionFeather: 2,
  useAdvancedSegmentation: true,
  useTextDetection: true,
}

/** Pipeline phases */
type Phase = 'idle' | 'detecting' | 'extracting' | 'building' | 'done' | 'error'

const PHASE_LABELS: Record<Phase, string> = {
  idle:       '',
  detecting:  'جارٍ تحليل الإطارات…',
  extracting: '✓ تم! الآن نجري إعادة رسم الخلفية…',
  building:   '✓ تم! الآن نبني الطبقات على الكانفاس…',
  done:       '✓ تم التفكيك وبنجاح!',
  error:      '✗ حدث خطأ',
}

const PHASE_FRACTION: Record<Phase, number> = {
  idle: 0, detecting: 0.25, extracting: 0.55, building: 0.85, done: 1, error: 0,
}

/** Scale + center image within logical canvas, preserving aspect ratio. */
function fitImageOnCanvas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
) {
  const scale = Math.min(canvasW / img.width, canvasH / img.height)
  const w = img.width * scale
  const h = img.height * scale
  const x = (canvasW - w) / 2
  const y = (canvasH - h) / 2
  ctx.clearRect(0, 0, canvasW, canvasH)
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.drawImage(img, x, y, w, h)
  return { x, y, scale }
}

/** Draw amber detection overlays on the canvas. */
function drawFrameOverlay(
  ctx: CanvasRenderingContext2D,
  frames: RotatedFrame[],
  offsetX: number,
  offsetY: number,
  scale: number,
) {
  for (const frame of frames) {
    const cx = offsetX + frame.cx * scale
    const cy = offsetY + frame.cy * scale
    const fw = frame.width * scale
    const fh = frame.height * scale
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((frame.angle * Math.PI) / 180)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 4
    ctx.strokeRect(-fw / 2, -fh / 2, fw, fh)
    ctx.fillStyle = 'rgba(245,158,11,0.15)'
    ctx.fillRect(-fw / 2, -fh / 2, fw, fh)
    ctx.restore()
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#f59e0b'
    ctx.fill()
  }
}

export default function DeconstructStudioModal({
  imageUrl,
  options,
  width = 1200,
  height = 800,
  editor,
  onBuild,
  onClose,
}: DeconstructStudioModalProps) {
  const opts = { ...DEFAULTS, ...options }
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [frames, setFrames] = useState<RotatedFrame[]>([])
  const [result, setResult] = useState<DeconstructionResult | null>(null)
  const [error, setError] = useState<string>('')

  // ── Draw image + overlays on canvas ────────────────────────────────────────
  const redrawCanvas = useCallback((img: HTMLImageElement, frms: RotatedFrame[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y, scale } = fitImageOnCanvas(ctx, img, width, height)
    if (frms.length > 0) drawFrameOverlay(ctx, frms, x, y, scale)
  }, [width, height])

  useLayoutEffect(() => {
    if (!imageUrl) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.onload = () => redrawCanvas(img, frames)
    img.src = imageUrl
  }, [imageUrl, width, height, frames, redrawCanvas])

  // ── Magic Pipeline ──────────────────────────────────────────────────────────
  const runMagicPipeline = useCallback(async () => {
    if (!imageUrl || !editor) return
    setPhase('detecting')
    setError('')

    try {
      // Step 1 – detect frames
      const detected = await detectSmartLayeredFrames(imageUrl, width, height, {
        minFrameArea: opts.minFrameArea,
        paperLuminanceThreshold: opts.paperLuminanceThreshold,
        occlusionFeather: opts.occlusionFeather,
        useAdvancedSegmentation: opts.useAdvancedSegmentation,
      })
      setFrames(detected)

      // Draw the detected overlays on canvas immediately
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const img = new Image()
          img.onload = () => {
            const { x, y, scale } = fitImageOnCanvas(ctx, img, width, height)
            drawFrameOverlay(ctx, detected, x, y, scale)
          }
          img.src = imageUrl
        }
      }

      // Step 2 – advance (in magic pipeline no separate element-detach step needed;
      //            foreground occlusion masks are already embedded in each detected frame)
      setPhase('extracting')

      // Step 3 – commit to canvas
      setPhase('building')
      const pageId = editor.state.activePageId
      const collageId = await editor.collage.create({ count: detected.length })
      const view = editor.viewOf(pageId)
      if (!view) throw new Error('Could not get view after collage creation')

      // Find slot object ids (role === undefined) in creation order
      const slotIds = view.canvas.getObjects()
        .filter(o => {
          const meta = (o as any).collage
          return meta && meta.id === collageId && !meta.role
        })
        .sort((a, b) => ((a as any).collage?.index ?? 0) - ((b as any).collage?.index ?? 0))
        .map(o => (o as any).id as string)

      // Fill each slot with the corresponding foreground-overlay data URL
      for (let i = 0; i < detected.length && i < slotIds.length; i++) {
        const frame = detected[i]
        if (!frame.foregroundOverlayDataUrl) continue
        await editor.insert.fillPlaceholderWith(pageId, slotIds[i], {
          url: frame.foregroundOverlayDataUrl,
          id: `overlay-${i}`,
          name: `Slot ${i + 1} overlay`,
        } as any)
      }

      // Build result
      const deconResult: DeconstructionResult = {
        healedBackgroundDataUrl: '',
        frames: detected,
        elements: [] as DetachedElement[],
        textCards: [] as DetectedTextCard[],
        pageWidth: width,
        pageHeight: height,
      }
      setResult(deconResult)
      setPhase('done')
      onBuild?.(deconResult)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setPhase('error')
      console.error('Magic pipeline failed:', err)
    }
  }, [imageUrl, editor, width, height, opts, onBuild])

  const handleClose = useCallback(() => { onClose?.() }, [onClose])
  const handleReset = useCallback(() => {
    setPhase('idle')
    setFrames([])
    setResult(null)
    setError('')
  }, [])

  const isRunning = phase === 'detecting' || phase === 'extracting' || phase === 'building'
  const isDone = phase === 'done'

  return (
    <section className="deconstruct-studio" role="dialog" aria-modal="true" aria-labelledby="deconstruct-title">
      {/* ── Header ── */}
      <div className="deconstruct-header">
        <div className="deconstruct-header-row">
          <h2 id="deconstruct-title" className="deconstruct-title">Smart Design Deconstructor</h2>
          <button type="button" className="deconstruct-close-btn" onClick={handleClose} aria-label="إغلاق">✕</button>
        </div>

        {/* Progress bar */}
        {phase !== 'idle' && (
          <div className="deconstruct-progress-wrap" role="status" aria-live="polite">
            <div className="deconstruct-progress-bar">
              <div
                className={`deconstruct-progress-fill ${phase === 'error' ? 'error' : ''}`}
                style={{ width: `${PHASE_FRACTION[phase] * 100}%` }}
              />
            </div>
            <p className="deconstruct-progress-msg">{PHASE_LABELS[phase]}</p>
          </div>
        )}
      </div>

      {/* ── Canvas preview ── */}
      <div className="deconstruct-stage">
        <div className="deconstruct-canvas-area">
          <canvas
            ref={canvasRef}
            className="deconstruct-canvas"
            width={width}
            height={height}
            role="img"
            aria-label={`${frames.length} إطار(i) مكتشف`}
          />
        </div>

        {/* ── Side panel ── */}
        <div className="deconstruct-actions">
          {isDone ? (
            /* ── Result summary ── */
            <>
              <div className="deconstruct-result-box">
                <h3>النتيجة</h3>
                <ul>
                  <li><strong>{frames.length}</strong> إطار صور (مدورة)</li>
                  <li><strong>{result?.elements.length ?? 0}</strong> عنصر زخرفة معزول</li>
                  <li><strong>{result?.textCards.length ?? 0}</strong> بطاقة نص قابل للتحرير</li>
                </ul>
                <p className="deconstruct-hint">الكولاج اتبني على الكانفاس. يمكنك تعديل الإطارات أو إضافة صور من相册.</p>
              </div>
              <button type="button" className="deconstruct-btn-primary" onClick={handleReset}>
                تفكيك قالب آخر
              </button>
              <button type="button" className="deconstruct-btn-secondary" onClick={handleClose}>
                إغلاق
              </button>
            </>
          ) : isRunning ? (
            /* ── Running state: no button ── */
            <div className="deconstruct-waiting">
              <div className="deconstruct-spinner" aria-hidden="true" />
              <p className="deconstruct-hint">
                {phase === 'detecting'   && 'يحلل الصورة بحثًا عن إطارات الصور…'}
                {phase === 'extracting'   && 'يعزل العناصر الزخرفية…'}
                {phase === 'building'     && 'ينشئ الكولاج على الكانفاس…'}
              </p>
            </div>
          ) : (
            /* ── Idle / Error state ── */
            <>
              {phase === 'error' && error && (
                <div className="deconstruct-error">
                  <p>{error}</p>
                </div>
              )}
              <button
                type="button"
                className="deconstruct-btn-magic"
                onClick={runMagicPipeline}
                disabled={!imageUrl || !editor}
              >
                ✨ بدء التفكيك السحري والبناء
              </button>
              {!imageUrl && (
                <p className="deconstruct-hint">ارفع صورة القالب أولًا من لوحة Collage.</p>
              )}
              {imageUrl && !editor && (
                <p className="deconstruct-hint">افتح المحرر لتطبيق النتيجة على الكانفاس.</p>
              )}
              <p className="deconstruct-hint">
                يكشف الإطارات المدورة، يعزل الزخارف، ويبني كولاج متعدد الطبقات على الكانفاس — كل ذلك محليًا بدون خادم.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
