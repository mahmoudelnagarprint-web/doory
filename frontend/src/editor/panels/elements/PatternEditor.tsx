import { useMemo, useState, useEffect, useRef } from 'react'
import { Download, Copy, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { applyPatternToRect, type PatternDefinition, type PatternOptions } from './FramesAndShapesCatalog'
import styles from './ElementsPanel.module.css'

export interface PatternEditorProps {
  pattern: PatternDefinition
  options: PatternOptions
  onChange: (options: PatternOptions) => void
  onInsert: (pattern: PatternDefinition) => void
}

export function PatternEditor({ pattern, options, onChange, onInsert }: PatternEditorProps) {
  const [previewSize, setPreviewSize] = useState({ width: 300, height: 200 })
  const previewRef = useRef<HTMLDivElement>(null)
  
  // Generate preview SVG
  const previewSvg = useMemo(() => {
    return applyPatternToRect(pattern.id, previewSize.width, previewSize.height, options)
  }, [pattern.id, previewSize, options])
  
  // Update preview size when container resizes
  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setPreviewSize({ width: Math.max(200, width), height: Math.max(150, height * 0.6) })
      }
    })
    if (previewRef.current) ro.observe(previewRef.current)
    return () => ro.disconnect()
  }, [])
  
  type ControlValue = string | number

const handleControlChange = (key: keyof PatternOptions | 'rotation', value: ControlValue) => {
    onChange({ ...options, [key]: value })
  }
  
  const resetToDefaults = () => {
    onChange({ ...pattern.defaultOptions })
  }
  
  const copyPatternSvg = async () => {
    try {
      await navigator.clipboard.writeText(previewSvg)
    } catch {
      // fallback
    }
  }
  
  const downloadPatternSvg = () => {
    const blob = new Blob([previewSvg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pattern-${pattern.id}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }
  
  return (
    <div className={styles.patternEditor} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Preview */}
      <div ref={previewRef} className={styles.patternPreview} style={{ 
        borderRadius: 8, 
        overflow: 'hidden', 
        background: 'var(--ed-surface-2)',
        border: '1px solid var(--ed-border)',
        minHeight: 150,
        position: 'relative',
      }}>
        <div 
          style={{ width: '100%', height: '100%' }} 
          dangerouslySetInnerHTML={{ __html: previewSvg }} 
        />
      </div>
      
      {/* Controls */}
      <div className={styles.patternControls} style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 10,
        padding: 8,
        background: 'var(--ed-surface-2)',
        borderRadius: 8,
        border: '1px solid var(--ed-border)',
      }}>
        {pattern.controls.map(control => (
          <div key={control.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ed-text-dim)' }}>
              {control.label}
              {control.type === 'range' && (
                <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 11, color: 'var(--ed-text-dim)' }}>
                  {options[control.key as keyof PatternOptions]}
                </span>
              )}
            </label>
            
            {control.type === 'color' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={options[control.key as keyof PatternOptions] as string}
                  onChange={(e) => handleControlChange(control.key, e.target.value)}
                  style={{ width: 36, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }}
                />
                <input
                  type="text"
                  value={options[control.key as keyof PatternOptions] as string}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) handleControlChange(control.key, e.target.value) }}
                  style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12, fontFamily: 'monospace' }}
                  placeholder="#rrggbb"
                />
              </div>
            )}
            
            {control.type === 'range' && (
              <input
                type="range"
                min={control.min?.toString() || '0'}
                max={control.max?.toString() || '100'}
                step={control.step?.toString() || '1'}
                value={options[control.key as keyof PatternOptions] as number}
                onChange={(e) => handleControlChange(control.key, Number(e.target.value))}
                style={{ cursor: 'pointer' }}
              />
            )}
            
            {control.type === 'select' && (
              <select
                value={options[control.key as keyof PatternOptions]}
                onChange={(e) => handleControlChange(control.key, e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}
              >
                {control.options?.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
        ))}
        
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={resetToDefaults}
            className={styles.actionBtn}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Reset to defaults"
          >
            <RotateCcw size={14} /> Reset
          </button>
          <button
            type="button"
            onClick={copyPatternSvg}
            className={styles.actionBtn}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Copy SVG to clipboard"
          >
            <Copy size={14} /> Copy SVG
          </button>
          <button
            type="button"
            onClick={downloadPatternSvg}
            className={styles.actionBtn}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Download SVG"
          >
            <Download size={14} /> Download
          </button>
          <button
            type="button"
            onClick={() => onInsert(pattern)}
            className={styles.primaryBtn}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
          >
            <SlidersHorizontal size={14} /> Insert to Canvas
          </button>
        </div>
      </div>
    </div>
  )
}