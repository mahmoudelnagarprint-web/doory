import { useState, useRef, useCallback } from 'react'
import { RotateCcw, Copy, Minus, Plus } from 'lucide-react'
import { gradientToCSS, type GradientDefinition } from '@/lib/api/gradients'
import styles from './ElementsPanel.module.css'

export interface GradientEditorProps {
  gradient: GradientDefinition
  angle: number
  type: 'linear' | 'radial'
  onChange: (changes: { angle?: number; type?: 'linear' | 'radial'; colors?: string[] }) => void
}

export function GradientEditor({ gradient, angle, type, onChange }: GradientEditorProps) {
  // Sync with props using render-phase state adjustment (React-recommended pattern)
  const [colors, setColors] = useState<string[]>(gradient.colors)
  if (colors !== gradient.colors) setColors(gradient.colors)
  
  const [localAngle, setLocalAngle] = useState(angle)
  if (localAngle !== angle) setLocalAngle(angle)
  
  const [localType, setLocalType] = useState<'linear' | 'radial'>(type)
  if (localType !== type) setLocalType(type)
  
  const previewRef = useRef<HTMLDivElement>(null)
  
  // Debounced change handler
  const debouncedChange = useRef<NodeJS.Timeout | undefined>(undefined)
  const notifyChange = useCallback((changes: { angle?: number; type?: 'linear' | 'radial'; colors?: string[] }) => {
    if (debouncedChange.current) clearTimeout(debouncedChange.current)
    debouncedChange.current = setTimeout(() => onChange(changes), 150)
  }, [onChange])
  
  const handleColorChange = (index: number, color: string) => {
    const newColors = [...colors]
    newColors[index] = color
    setColors(newColors)
    notifyChange({ colors: newColors })
  }
  
  const addColor = () => {
    if (colors.length >= 8) return
    const newColors = [...colors]
    // Insert midpoint color
    const insertAt = Math.floor(newColors.length / 2)
    newColors.splice(insertAt, 0, interpolateColor(newColors[insertAt - 1], newColors[insertAt]))
    setColors(newColors)
    notifyChange({ colors: newColors })
  }
  
  const removeColor = (index: number) => {
    if (colors.length <= 2) return
    const newColors = colors.filter((_, i) => i !== index)
    setColors(newColors)
    notifyChange({ colors: newColors })
  }
  
  const handleAngleChange = (newAngle: number) => {
    setLocalAngle(newAngle)
    notifyChange({ angle: newAngle })
  }
  
  const handleTypeChange = (newType: 'linear' | 'radial') => {
    setLocalType(newType)
    notifyChange({ type: newType })
  }
  
  const resetToOriginal = () => {
    setColors(gradient.colors)
    setLocalAngle(135)
    setLocalType('linear')
    notifyChange({ colors: gradient.colors, angle: 135, type: 'linear' })
  }
  
  const copyCSS = async () => {
    const css = gradientToCSS({ ...gradient, colors, type: localType, angle: localAngle })
    await navigator.clipboard.writeText(css)
  }
  
  // Preview gradient
  const previewStyle = {
    background: gradientToCSS({ ...gradient, colors, type: localType, angle: localType === 'radial' ? 0 : localAngle }),
    borderRadius: 8,
    height: 60,
    border: '1px solid var(--ed-border)',
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)' }}>
      {/* Preview */}
      <div ref={previewRef} style={previewStyle} />
      
      {/* Angle & Type */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
          <RotateCcw size={16} style={{ color: 'var(--ed-text-dim)' }} />
          <label style={{ fontSize: 12, color: 'var(--ed-text-dim)', minWidth: 40 }}>Angle</label>
          <input
            type="range"
            min="0"
            max="360"
            value={localAngle}
            onChange={e => handleAngleChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min="0"
            max="360"
            value={localAngle}
            onChange={e => handleAngleChange(Number(e.target.value))}
            style={{ width: 60, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12, textAlign: 'right' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--ed-text-dim)' }}>Type</label>
          <select
            value={localType}
            onChange={e => handleTypeChange(e.target.value as 'linear' | 'radial')}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12 }}
          >
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
        </div>
      </div>
      
      {/* Color Stops */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ed-text)' }}>Color Stops ({colors.length})</label>
          <button onClick={addColor} disabled={colors.length >= 8} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', cursor: colors.length >= 8 ? 'not-allowed' : 'pointer', opacity: colors.length >= 8 ? 0.5 : 1 }}>
            <Plus size={12} /> Add
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {colors.map((color, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 60, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="color"
                  value={color}
                  onChange={e => handleColorChange(i, e.target.value)}
                  style={{ width: 32, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }}
                />
                <input
                  type="text"
                  value={color}
                  onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) handleColorChange(i, e.target.value) }}
                  style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 11, fontFamily: 'monospace', textAlign: 'center' }}
                  placeholder="#rrggbb"
                />
                {colors.length > 2 && (
                  <button onClick={() => removeColor(i)} style={{ padding: 4, background: 'var(--ed-error)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', opacity: 0.8 }} title="Remove">
                    <Minus size={10} />
                  </button>
                )}
              </div>
              <span style={{ fontSize: 10, color: 'var(--ed-text-dim)', textAlign: 'center' }}>Stop {i + 1}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button onClick={resetToOriginal} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RotateCcw size={12} /> Reset
        </button>
        <button onClick={copyCSS} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Copy size={12} /> Copy CSS
        </button>
      </div>
    </div>
  )
}

function interpolateColor(color1: string, color2: string): string {
  const c1 = hexToRgb(color1)
  const c2 = hexToRgb(color2)
  const r = Math.round((c1.r + c2.r) / 2)
  const g = Math.round((c1.g + c2.g) / 2)
  const b = Math.round((c1.b + c2.b) / 2)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}