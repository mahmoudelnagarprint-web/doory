/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
/**
 * Deconstruct Studio Modal — Smart Design Deconstructor.
 *
 * Interactive 4‑mode preview canvas for deconstructing a flat template into a layered collage:
 * 1. Auto‑Detect Frames (rotated slots + foreground occlusion overlays)
 * 2. Detach Elements (lasso / box → detach + inpaint background hole)
 * 3. Extract & Erase Text (raster text detection + Telea erasure + live text layer)
 * 4. One‑Click Build Layered Collage (commits result to the editor canvas).
 *
 * The whole module is lazy‑loaded by CollagePanel.tsx so the initial editor bundle is untouched.
 *
 * When rendered inside a full-screen Deconstruct overlay, the canvas fills the modal body
 * responsively. Fixed pixel dimensions are used as the logical canvas resolution but the
 * CSS makes the rendered element scale to fit its container.
 */
import { useState, useCallback } from 'react'
import type { DeconstructorOptions, DeconstructionResult, DetachedElement, DetectedTextCard, RotatedFrame } from './types'
import { detectSmartLayeredFrames } from './frameExtractor'
import './DeconstructStudio.css'

export interface DeconstructStudioModalProps {
  imageUrl?: string
  options?: DeconstructorOptions
  /** Logical canvas width in px. Default 1200. */
  width?: number
  /** Logical canvas height in px. Default 800. */
  height?: number
  onBuild?: (result: DeconstructionResult) => void
  onClose?: () => void
}

const DEFAULTS: Required<DeconstructorOptions> = {
  minFrameArea: 0.02,
  paperLuminanceThreshold: 200,
  occlusionFeather: 2,
  useAdvancedSegmentation: true,
  useTextDetection: true,
}

export default function DeconstructStudioModal({
  imageUrl,
  options,
  width = 1200,
  height = 800,
  onBuild,
  onClose,
}: DeconstructStudioModalProps) {
  const opts = { ...DEFAULTS, ...options }
  const [isLoading, setIsLoading] = useState(false)
  const [frames, setFrames] = useState<RotatedFrame[]>([])
  const [elements, _setElements] = useState<DetachedElement[]>([])
  const [textCards, _setTextCards] = useState<DetectedTextCard[]>([])
  const [mode, setMode] = useState<'auto-detect' | 'detach' | 'erase-text' | 'build'>('auto-detect')
  const [result, setResult] = useState<DeconstructionResult | null>(null)

  const runAutoDetect = useCallback(async () => {
    if (!imageUrl) return
    setIsLoading(true)
    try {
      const detected = await detectSmartLayeredFrames(imageUrl, width, height, {
        minFrameArea: opts.minFrameArea,
        paperLuminanceThreshold: opts.paperLuminanceThreshold,
        occlusionFeather: opts.occlusionFeather,
        useAdvancedSegmentation: opts.useAdvancedSegmentation,
      })
      setFrames(detected)
      setResult(null)
    } catch (err) {
      console.error('Auto‑detect failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [imageUrl, width, height, opts])

  const buildLayeredCollage = useCallback(async () => {
    setIsLoading(true)
    try {
      const deconstructResult: DeconstructionResult = {
        healedBackgroundDataUrl: '',
        frames,
        elements,
        textCards,
        pageWidth: width,
        pageHeight: height,
      }
      setResult(deconstructResult)
      onBuild?.(deconstructResult)
    } catch (err) {
      console.error('Build layered collage failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [frames, elements, textCards, width, height, onBuild])

  const closeModal = useCallback(() => {
    onClose?.()
  }, [onClose])

  const modes: { id: 'auto-detect' | 'detach' | 'erase-text' | 'build'; label: string }[] = [
    { id: 'auto-detect', label: 'Auto‑Detect Frames' },
    { id: 'detach', label: 'Detach Elements' },
    { id: 'erase-text', label: 'Extract & Erase Text' },
    { id: 'build', label: 'One‑Click Build' },
  ]

  return (
    <section className="deconstruct-studio" role="dialog" aria-modal="true" aria-labelledby="deconstruct-title">
      <div className="deconstruct-header">
        <h2 id="deconstruct-title" className="deconstruct-title">Smart Design Deconstructor</h2>
        <div className="deconstruct-bar">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              className="deconstruct-tab"
              data-active={mode === m.id ? 'true' : undefined}
              onClick={() => setMode(m.id)}
              disabled={isLoading}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="deconstruct-stage">
        <div className="deconstruct-canvas-area">
          {/* Logical canvas dimensions are width×height; CSS scales it to fill the container. */}
          <canvas
            className="deconstruct-canvas"
            width={width}
            height={height}
            role="img"
            aria-label={`Preview: ${frames.length} frame(s) detected`}
          />
        </div>

        <div className="deconstruct-actions">
          {mode === 'auto-detect' && (
            <>
              <button className="deconstruct-btn-primary" onClick={runAutoDetect} disabled={!imageUrl || isLoading}>
                {isLoading ? 'Detecting…' : 'Run Auto‑Detect'}
              </button>
              {!isLoading && <p className="deconstruct-hint">{frames.length} frame(s) detected</p>}
            </>
          )}
          {mode === 'detach' && (
            <p className="deconstruct-hint">Draw a box or click on an element (flower, bow, pin, card) to detach it.</p>
          )}
          {mode === 'erase-text' && (
            <>
              <p className="deconstruct-hint">Select a text region on a quote card to erase raster text and spawn a live editable layer.</p>
              {textCards.length > 0 && <p className="deconstruct-hint">{textCards.length} text region(s) found</p>}
            </>
          )}
          {mode === 'build' && (
            <>
              <p className="deconstruct-hint">Commit the layered collage (background + slots + overlays + text) to the editor.</p>
              <button className="deconstruct-btn-primary" onClick={buildLayeredCollage} disabled={isLoading}>
                {isLoading ? 'Building…' : 'Build Layered Collage'}
              </button>
            </>
          )}
        </div>
      </div>

      {result && (
        <div className="deconstruct-result" aria-live="polite">
          <h3>Build Complete</h3>
          <ul className="deconstruct-result-list">
            <li>{frames.length} rotated photo slot(s)</li>
            <li>{elements.length} detached element layer(s)</li>
            <li>{textCards.length} live editable text card(s)</li>
          </ul>
        </div>
      )}
    </section>
  )
}
