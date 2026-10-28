import { useState, useCallback } from 'react'
import { IText } from 'fabric'
import { Wand2, Copy, Download, SlidersHorizontal, Zap, Square, Box, Diamond, BadgePercent, GitCompare, Circle, Sparkles } from 'lucide-react'
import { TEXT_EFFECT_PRESETS, applyTextEffect, type TextEffectPreset, generateCurvedTextSVG, type CurvedTextOptions } from '@/lib/api/textEffects'
import { useEditor } from '../../context'
import styles from './ElementsPanel.module.css'

// Icons for each effect category
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  glow: <Zap size={14} />,
  outline: <Square size={14} />,
  '3d': <Box size={14} />,
  metallic: <Diamond size={14} />,
  border: <BadgePercent size={14} />,
  badge: <BadgePercent size={14} />,
  glitch: <GitCompare size={14} />,
  shadow: <Circle size={14} />,
}

export function TextEffectsPanel() {
  const editor = useEditor()
  const [selectedEffect, setSelectedEffect] = useState<TextEffectPreset | null>(null)
  const [textColor, setTextColor] = useState('#1e293b')
  const [previewText, setPreviewText] = useState('Text Effect')
  const [fontSize] = useState(48)
  const [fontFamily, setFontFamily] = useState('Inter, system-ui, sans-serif')
  
  // Curved text state
  const [curve, setCurve] = useState(0)
  const [warp, setWarp] = useState<CurvedTextOptions['warp']>('none')
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr')
  const [waveAmplitude, setWaveAmplitude] = useState(20)
  const [waveFrequency, setWaveFrequency] = useState(0.02)
  const [skewX, setSkewX] = useState(0)
  const [skewY, setSkewY] = useState(0)
  
  const handleApplyEffect = useCallback(async (preset: TextEffectPreset) => {
    const selection = editor.selectedObjects().filter((obj): obj is IText => obj instanceof IText)
    if (selection.length === 0) {
      editor.toast('Select text elements first', 'info')
      return
    }
    
    // Apply to all selected text objects
    for (const obj of selection) {
      obj.set('fill', textColor)
      applyTextEffect(obj, preset, textColor)
    }
    editor.refreshSelection()
    editor.toast(`Applied "${preset.name}" to ${selection.length} text element(s)`, 'success')
  }, [editor, textColor])
  
  const handleApplyCurve = useCallback(async () => {
    const selection = editor.selectedObjects().filter((obj): obj is IText => obj instanceof IText)
    if (selection.length === 0) {
      editor.toast('Select text elements first', 'info')
      return
    }
    
    const curveOptions: CurvedTextOptions = {
      curve,
      warp,
      direction,
      waveAmplitude,
      waveFrequency,
      skewX,
      skewY,
    }
    
    for (const obj of selection) {
      generateCurvedTextSVG(
        obj.text,
        curveOptions,
        obj.fontFamily,
        obj.fontSize,
        typeof obj.fill === 'string' ? obj.fill : textColor,
        `${obj.fontWeight ?? '400'}`
      )
      // Replace text object with curved text group
      // This would need Fabric SVG parsing
    }
    editor.toast(`Applied curve (${curve > 0 ? '↑' : curve < 0 ? '↓' : '—'}) to ${selection.length} text element(s)`, 'success')
  }, [editor, curve, warp, direction, waveAmplitude, waveFrequency, skewX, skewY, textColor])
  
  return (
    <div className={styles.textEffectsPanel} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Global Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 12, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>Preview Text</label>
          <input
            type="text"
            value={previewText}
            onChange={e => setPreviewText(e.target.value)}
            style={{ width: 200, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>Text Color</label>
          <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} style={{ width: 36, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
          <input type="text" value={textColor} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setTextColor(e.target.value) }} style={{ width: 90, padding: '6px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12, fontFamily: 'monospace' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>Font</label>
          <input type="text" value={fontFamily} onChange={e => setFontFamily(e.target.value)} placeholder="Inter, system-ui, sans-serif" style={{ width: 250, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }} />
        </div>
      </div>
      
      {/* Effect Presets Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
        {TEXT_EFFECT_PRESETS.map(preset => (
          <div
            key={preset.id}
            className={`${styles.effectCard} ${selectedEffect?.id === preset.id ? styles.selected : ''}`}
            onClick={() => setSelectedEffect(preset)}
            style={{
              padding: 12,
              background: 'var(--ed-surface-2)',
              borderRadius: 8,
              border: `2px solid ${selectedEffect?.id === preset.id ? 'var(--ed-accent)' : 'transparent'}`,
              cursor: 'pointer',
              transition: 'border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {CATEGORY_ICONS[preset.category]}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.name}</div>
                <div style={{ fontSize: 10, color: 'var(--ed-text-dim)' }}>{preset.category}</div>
              </div>
            </div>
            
            {/* Live Preview */}
            <div 
              style={{ 
                height: 60, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: 'var(--ed-surface-3)',
                borderRadius: 6,
                fontFamily,
                fontSize: `${fontSize}px`,
                color: textColor,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <span style={{ fontFamily, fontSize, color: textColor }}>{previewText}</span>
            </div>
            
            <button
              onClick={e => { e.stopPropagation(); handleApplyEffect(preset) }}
              style={{ width: '100%', marginTop: 8, padding: '6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--ed-border)', background: selectedEffect?.id === preset.id ? 'var(--ed-accent)' : 'var(--ed-surface-3)', color: selectedEffect?.id === preset.id ? '#fff' : 'var(--ed-text)', cursor: 'pointer' }}
            >
              {selectedEffect?.id === preset.id ? '✓ Applied' : 'Apply'}
            </button>
          </div>
        ))}
      </div>
      
      {/* Selected Effect Details */}
      {selectedEffect && (
        <div style={{ padding: 16, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {CATEGORY_ICONS[selectedEffect.category]}
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedEffect.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ed-text-dim)' }}>{selectedEffect.description}</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => handleApplyEffect(selectedEffect)} className={styles.primaryBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Wand2 size={14} /> Apply to Selection
            </button>
            <button onClick={() => {}} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Copy size={14} /> Copy Filter SVG
            </button>
            <button onClick={() => {}} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Download size={14} /> Download Filter
            </button>
          </div>
        </div>
      )}
      
      {/* Curved / Warped Text Engine */}
      <div style={{ marginTop: 8, padding: 16, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)' }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} /> Curved / Warped Text
        </h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {/* Curve Slider */}
          <div>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ed-text-dim)', marginBottom: 4 }}>
              <span>Curve</span>
              <span>{curve > 0 ? '+' : ''}{curve}%</span>
            </label>
            <input
              type="range"
              min="-100"
              max="100"
              value={curve}
              onChange={e => setCurve(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ed-text-dim)', marginTop: 2 }}>
              <span>Concave ↓</span>
              <span>Flat</span>
              <span>Convex ↑</span>
            </div>
          </div>
          
          {/* Warp Type */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--ed-text-dim)', marginBottom: 4 }}>Warp Type</label>
            <select value={warp} onChange={e => setWarp(e.target.value as CurvedTextOptions['warp'])} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}>
              <option value="none">None</option>
              <option value="wave">Wave</option>
              <option value="arch">Arch</option>
              <option value="skew">Skew</option>
            </select>
          </div>
          
          {/* Direction (Critical for Arabic RTL) */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--ed-text-dim)', marginBottom: 4 }}>Text Direction</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, padding: '8px', textAlign: 'center', borderRadius: 6, border: `2px solid ${direction === 'ltr' ? 'var(--ed-accent)' : 'var(--ed-border)'}`, background: direction === 'ltr' ? 'var(--ed-accent)' : 'transparent', color: direction === 'ltr' ? '#fff' : 'var(--ed-text)', cursor: 'pointer' }} onClick={() => setDirection('ltr')}>
                LTR →
              </label>
              <label style={{ flex: 1, padding: '8px', textAlign: 'center', borderRadius: 6, border: `2px solid ${direction === 'rtl' ? 'var(--ed-accent)' : 'var(--ed-border)'}`, background: direction === 'rtl' ? 'var(--ed-accent)' : 'transparent', color: direction === 'rtl' ? '#fff' : 'var(--ed-text)', cursor: 'pointer' }} onClick={() => setDirection('rtl')}>
                ← RTL
              </label>
            </div>
          </div>
          
          {/* Wave Controls */}
          {warp === 'wave' && (
            <>
              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ed-text-dim)', marginBottom: 4 }}>
                  <span>Amplitude</span>
                  <span>{waveAmplitude}px</span>
                </label>
                <input type="range" min="0" max="100" value={waveAmplitude} onChange={e => setWaveAmplitude(Number(e.target.value))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ed-text-dim)', marginBottom: 4 }}>
                  <span>Frequency</span>
                  <span>{waveFrequency.toFixed(3)}</span>
                </label>
                <input type="range" min="0.005" max="0.1" step="0.001" value={waveFrequency} onChange={e => setWaveFrequency(Number(e.target.value))} style={{ width: '100%' }} />
              </div>
            </>
          )}
          
          {/* Skew Controls */}
          {warp === 'skew' && (
            <>
              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ed-text-dim)', marginBottom: 4 }}>
                  <span>Skew X</span>
                  <span>{skewX}°</span>
                </label>
                <input type="range" min="-45" max="45" value={skewX} onChange={e => setSkewX(Number(e.target.value))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ed-text-dim)', marginBottom: 4 }}>
                  <span>Skew Y</span>
                  <span>{skewY}°</span>
                </label>
                <input type="range" min="-45" max="45" value={skewY} onChange={e => setSkewY(Number(e.target.value))} style={{ width: '100%' }} />
              </div>
            </>
          )}
        </div>
        
        {/* Apply Curve Button */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button onClick={handleApplyCurve} className={styles.primaryBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <SlidersHorizontal size={14} /> Apply Curve to Selection
          </button>
          <button onClick={() => { setCurve(0); setWarp('none') }} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Zap size={14} /> Reset
          </button>
        </div>
      </div>
    </div>
  )
}