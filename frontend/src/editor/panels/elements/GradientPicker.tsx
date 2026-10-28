import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { Download, Palette, Sun, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { fetchUIGradients, gradientToCSS, gradientToSVG, FALLBACK_GRADIENTS, type GradientDefinition } from '@/lib/api/gradients'
import { useEditor } from '../../context'
import styles from './ElementsPanel.module.css'

const GradientEditor = lazy(() => import('./GradientEditor').then(m => ({ default: m.GradientEditor })))

export function GradientPicker() {
  const editor = useEditor()
  const [gradients, setGradients] = useState<GradientDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGradient, setSelectedGradient] = useState<GradientDefinition | null>(null)
  const [angle, setAngle] = useState(135)
  const [type, setType] = useState<'linear' | 'radial'>('linear')
  const [searchQuery, setSearchQuery] = useState('')
  const [category, setCategory] = useState<'all' | 'warm' | 'cool' | 'neutral'>('all')
  
  // Load gradients on mount
  useEffect(() => {
    let active = true
    fetchUIGradients().then(data => {
      if (active) {
        setGradients(data.length > 0 ? data : FALLBACK_GRADIENTS)
        if (data.length > 0 && !selectedGradient) {
          setSelectedGradient(data[0])
        }
      }
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])
  
  // Filter gradients
  const filteredGradients = gradients.filter(g => {
    if (category === 'all') return true
    const isWarm = g.colors.some(c => /^#(f|e|d|c|b|a|9|8)/i.test(c.replace('#', '')))
    const isCool = g.colors.some(c => /^#(0|1|2|3|4|5)/i.test(c.replace('#', '')))
    if (category === 'warm') return isWarm
    if (category === 'cool') return isCool
    return !isWarm && !isCool
  }).filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  const applyToCanvas = useCallback(async (gradient: GradientDefinition) => {
    try {
      editor.pages.setBackground(editor.state.activePageId, {
        type: 'gradient',
        kind: type,
        angle,
        stops: gradientStops(gradient),
      })
      editor.toast(`Applied "${gradient.name}" to canvas`, 'success')
    } catch {
      editor.toast('Failed to apply gradient', 'error')
    }
  }, [editor, angle, type])
  
  const applyToSelected = useCallback(async (gradient: GradientDefinition) => {
    try {
      if (editor.state.selection.ids.length === 0) {
        editor.toast('Select an element first', 'info')
        return
      }
      
      editor.style.setFill({
        type: 'gradient',
        kind: type,
        angle,
        stops: gradientStops(gradient),
      })
      editor.toast(`Applied "${gradient.name}" to selection`, 'success')
    } catch {
      editor.toast('Failed to apply gradient', 'error')
    }
  }, [editor, angle, type])
  
  const downloadGradient = useCallback((gradient: GradientDefinition) => {
    const svg = gradientToSVG({ ...gradient, type, angle }, 1920, 1080)
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gradient-${gradient.name.toLowerCase().replace(/\s+/g, '-')}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }, [angle, type])
  
  if (loading && gradients.length === 0) {
    return (
      <div className={styles.gradientPicker} style={{ padding: 16 }}>
        <div className={styles.loading}>Loading gradients...</div>
      </div>
    )
  }
  
  return (
    <div className={styles.gradientPicker} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)' }}>
        {/* Search & Category */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Palette size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ed-text-dim)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search gradients..."
              style={{ width: '100%', padding: '8px 10px 8px 36px', borderRadius: 6, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}
            />
          </div>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as 'all' | 'warm' | 'cool' | 'neutral')}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}
          >
            <option value="all">All</option>
            <option value="warm">Warm</option>
            <option value="cool">Cool</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>
        
        {/* Angle & Type Controls */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
            <RotateCcw size={16} style={{ color: 'var(--ed-text-dim)' }} />
            <label style={{ fontSize: 12, color: 'var(--ed-text-dim)', minWidth: 40 }}>Angle</label>
            <input
              type="range"
              min="0"
              max="360"
              value={angle}
              onChange={e => setAngle(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, minWidth: 40, textAlign: 'right' }}>{angle}°</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--ed-text-dim)' }}>Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as 'linear' | 'radial')}
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12 }}
            >
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
            </select>
          </div>
        </div>
        
        {/* Advanced Editor */}
        {selectedGradient && (
          <Suspense fallback={<div className={styles.skeleton} style={{ height: 120 }} />}>
            <GradientEditor
              gradient={selectedGradient}
              angle={angle}
              type={type}
              onChange={({ angle: a, type: t }) => { if (a !== undefined) setAngle(a); if (t) setType(t) }}
            />
          </Suspense>
        )}
      </div>
      
      {/* Gradient Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        {filteredGradients.map(gradient => (
          <div
            key={gradient.id}
            className={`${styles.gradientCard} ${selectedGradient?.id === gradient.id ? styles.selected : ''}`}
            onClick={() => setSelectedGradient(gradient)}
            style={{
              position: 'relative',
              aspectRatio: '16/9',
              borderRadius: 8,
              overflow: 'hidden',
              cursor: 'pointer',
              border: '2px solid transparent',
              transition: 'border-color 0.15s, transform 0.15s',
              background: gradientToCSS({ ...gradient, type, angle }),
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.borderColor = 'var(--ed-accent)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'transparent' }}
          >
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 8, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'left' }}>{gradient.name}</span>
              <div style={{ display: 'flex', gap: 4, fontSize: 10 }}>
                {gradient.colors.slice(0, 4).map((c, i) => (
                  <span key={i} style={{ width: 12, height: 12, borderRadius: 2, background: c, border: '1px solid rgba(0,0,0,0.2)' }} />
                ))}
              </div>
            </div>
            <div style={{ position: 'absolute', bottom: 4, right: 4, display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.2s' }}>
              <button onClick={e => { e.stopPropagation(); applyToSelected(gradient) }} style={{ padding: 4, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }} title="Apply to selection">✎</button>
              <button onClick={e => { e.stopPropagation(); downloadGradient(gradient) }} style={{ padding: 4, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }} title="Download SVG">↓</button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Actions for selected gradient */}
      {selectedGradient && (
        <div style={{ display: 'flex', gap: 8, padding: 8, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)' }}>
          <button onClick={() => applyToCanvas(selectedGradient)} className={styles.primaryBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Sun size={14} /> Apply to Canvas Background
          </button>
          <button onClick={() => applyToSelected(selectedGradient)} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <SlidersHorizontal size={14} /> Apply to Selection
          </button>
          <button onClick={() => downloadGradient(selectedGradient)} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Download SVG
          </button>
        </div>
      )}
    </div>
  )
}

function gradientStops(gradient: GradientDefinition) {
  const last = Math.max(1, gradient.colors.length - 1)
  return gradient.colors.map((color, i) => ({ offset: i / last, color }))
}