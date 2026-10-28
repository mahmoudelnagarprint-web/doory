import { useState, useRef, useEffect } from 'react'
import { Palette } from 'lucide-react'
import styles from './ElementsPanel.module.css'

export interface UndrawColorPickerProps {
  color: string
  onChange: (color: string) => void
}

export function UndrawColorPicker({ color, onChange }: UndrawColorPickerProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  
  // Preset colors for unDraw illustrations
  const presets = [
    '#7c5cff', '#6c63ff', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981',
    '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#818cf8',
    '#ffffff', '#f8fafc', '#e2e8f0', '#94a3b8', '#64748b', '#334155', '#1e293b', '#0f172a',
  ]
  
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  return (
    <div className={styles.colorPickerWrapper} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={styles.colorPickerBtn}
        style={{
          background: color,
          border: '1px solid var(--ed-border)',
          borderRadius: 6,
          width: 32,
          height: 32,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
        aria-label="Primary color for illustrations"
        title="Change illustration primary color"
      >
        <Palette size={14} style={{ color: getContrastColor(color) }} />
      </button>
      
      {open && (
        <div
          ref={dropdownRef}
          className={styles.colorPickerDropdown}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            padding: 8,
            background: 'var(--ed-surface-2)',
            border: '1px solid var(--ed-border)',
            borderRadius: 8,
            boxShadow: 'var(--ed-shadow-lg)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 200,
          }}
        >
          {/* Custom color input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              style={{ width: 32, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }}
            />
            <input
              type="text"
              value={color}
              onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value) }}
              style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12, fontFamily: 'monospace' }}
              placeholder="#rrggbb"
            />
          </div>
          
          {/* Preset swatches */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
            {presets.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => { onChange(preset); setOpen(false) }}
                style={{
                  width: 24, height: 24, borderRadius: 4,
                  background: preset,
                  border: preset === color ? '2px solid var(--ed-text)' : '1px solid var(--ed-border)',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title={preset}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function getContrastColor(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}