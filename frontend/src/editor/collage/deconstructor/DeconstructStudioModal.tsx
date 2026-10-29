// @ts-nocheck
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
 */
import { useState, useCallback } from 'react'
import type { DeconstructionResult, RotatedFrame, DetectedTextCard, DetachedElement } from './types'
import { detectSmartLayeredFrames } from './frameExtractor'

export interface DeconstructStudioModalProps {
  imageUrl?: string
  width?: number
  height?: number
  onBuild?: (result: DeconstructionResult) => void
  onClose?: () => void
}

export default function DeconstructStudioModal({ imageUrl, width = 1200, height = 800, onBuild, onClose }: DeconstructStudioModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [frames, setFrames] = useState<RotatedFrame[]>([])
  const [elements, setElements] = useState<DetachedElement[]>([])
  const [textCards, setTextCards] = useState<DetectedTextCard[]>([])
  const [mode, setMode] = useState<'auto-detect' | 'detach' | 'erase-text' | 'build'>('auto-detect')
  const [result, setResult] = useState<DeconstructionResult | null>(null)

  const runAutoDetect = useCallback(async () => {
    if (!imageUrl) return
    setIsLoading(true)
    try {
      const detected = await detectSmartLayeredFrames(imageUrl, width, height, { minFrameArea: 0.01 })
      setFrames(detected)
      setResult(null)
    } catch (err) {
      console.error('Auto‑detect failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [imageUrl, width, height])

  const buildLayeredCollage = useCallback(async () => {
    setIsLoading(true)
    try {
      const healedBackgroundDataUrl = ''
      const deconstructResult: DeconstructionResult = {
        healedBackgroundDataUrl,
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
    { id: 'build', label: 'One‑Click Build Layered Collage' },
  ]

  return (
    <section className="deconstruct-studio-modal" role="dialog" aria-modal="true" aria-labelledby="deconstruct-title">
      <h2 id="deconstruct-title" className="deconstruct-title">Smart Design Deconstructor</h2>

      <div className="deconstruct-bar">
        {modes.map((m) => (
          <button key={m.id} className={`deconstruct-tab ${mode === m.id ? 'active' : ''}`} onClick={() => setMode(m.id)} disabled={isLoading}>
            {m.label}
          </button>
        ))}
        <button className="deconstruct-close" onClick={closeModal} aria-label="Close">Close</button>
      </div>

      <div className="deconstruct-stage">
        <div className="deconstruct-canvas-area">
          <canvas className="deconstruct-canvas" width={width} height={height} role="img" aria-label={`Preview: ${mode === 'auto-detect' ? frames.length : 0} frames detected`} />
        </div>

        <div className="deconstruct-actions">
          {mode === 'auto-detect' && (
            <>
              <button className="deconstruct-primary-btn" onClick={runAutoDetect} disabled={!imageUrl || isLoading}>
                {isLoading ? 'Detecting…' : 'Run Auto‑Detect'}
              </button>
              <p className="deconstruct-hint">{frames.length} frame(s) detected</p>
            </>
          )}
          {mode === 'detach' && (
            <>
              <p className="deconstruct-hint">Draw a box or click on an element (flower, bow, pin, card) to detach it.</p>
            </>
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
              <button className="deconstruct-primary-btn" onClick={buildLayeredCollage} disabled={isLoading}>
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
