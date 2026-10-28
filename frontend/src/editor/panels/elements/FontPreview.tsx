import { useState, useCallback } from 'react'
import { Copy, Download, ALargeSmall, Type } from 'lucide-react'
import { loadFont, getFontFamilyCSS, type FontDefinition } from '@/lib/api/fontsource'
import styles from './ElementsPanel.module.css'

export interface FontPreviewProps {
  font: FontDefinition
  onApply: (font: FontDefinition) => void
  onCopyCSS: (font: FontDefinition) => void
}

export function FontPreview({ font, onApply, onCopyCSS }: FontPreviewProps) {
  const [previewText, setPreviewText] = useState(font.language === 'arabic' ? 'مرحباً بالعالم\nHello World' : 'Hello World\nThe quick brown fox')
  const [fontSize, setFontSize] = useState(36)
  const [fontWeight, setFontWeight] = useState('400')
  const [textColor, setTextColor] = useState('#1e293b')
  const [bgColor, setBgColor] = useState('transparent')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  
  const fontFamilyCSS = getFontFamilyCSS(font)
  
  const handleLoadFont = useCallback(async () => {
    setLoading(true)
    try {
      await loadFont(font)
      setLoaded(true)
    } catch (e) {
      console.error('Font load failed:', e)
    } finally {
      setLoading(false)
    }
  }, [font])
  
  const handleApply = useCallback(() => {
    if (!loaded) return
    onApply(font)
  }, [loaded, onApply, font])
  
  const handleCopyCSS = useCallback(() => {
    onCopyCSS(font)
  }, [onCopyCSS, font])
  
  const handleDownloadSVG = useCallback(() => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
  <rect width="800" height="400" fill="${bgColor}"/>
  <text x="400" y="220" text-anchor="middle" font-family="${fontFamilyCSS}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${textColor}" dominant-baseline="middle">
    ${previewText.split('\n').map((line, i) => `<tspan x="400" dy="${i === 0 ? 0 : '1.2em'}">${line}</tspan>`).join('')}
  </text>
</svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `font-preview-${font.family.replace(/\s+/g, '-')}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }, [font, previewText, fontSize, fontWeight, textColor, bgColor])
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{font.family}</h4>
          <div style={{ fontSize: 12, color: 'var(--ed-text-dim)', marginTop: 2 }}>
            {font.language === 'arabic' ? '🇸🇦 Arabic' : font.language === 'latin' ? '🇺🇸 Latin' : '🌐 Both'} • {font.category} • {font.variants.length} weights
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleLoadFont} disabled={loaded || loading} style={{ padding: '6px 12px', fontSize: 11, borderRadius: 4, border: '1px solid var(--ed-border)', background: loaded ? 'var(--ed-success)' : 'var(--ed-accent)', color: '#fff', cursor: loaded || loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Loading...' : loaded ? '✓ Loaded' : 'Load Font'}
          </button>
        </div>
      </div>
      
      {/* Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>Preview Text</label>
          <textarea
            value={previewText}
            onChange={e => setPreviewText(e.target.value)}
            rows={3}
            style={{ padding: '8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', minHeight: 70 }}
            dir={font.language === 'arabic' ? 'rtl' : 'ltr'}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>Font Size</label>
          <input
            type="range"
            min="12"
            max="120"
            value={fontSize}
            onChange={e => setFontSize(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <input type="number" min="12" max="120" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: '60px', padding: '4px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)' }} />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>Font Weight</label>
          <select
            value={fontWeight}
            onChange={e => setFontWeight(e.target.value)}
            style={{ padding: '8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}
          >
            {font.variants.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>Text Color</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} style={{ width: 40, height: 40, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
            <input type="text" value={textColor} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setTextColor(e.target.value) }} style={{ flex: 1, padding: '8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12, fontFamily: 'monospace' }} />
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>Background</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 40, height: 40, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
            <input type="text" value={bgColor} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value) || e.target.value === 'transparent') setBgColor(e.target.value) }} style={{ flex: 1, padding: '8px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 12, fontFamily: 'monospace' }} />
          </div>
        </div>
      </div>
      
      {/* Live Preview */}
      <div style={{ 
        padding: 24, 
        background: bgColor, 
        borderRadius: 12, 
        border: '1px solid var(--ed-border)',
        minHeight: 160,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <div 
          style={{ 
            fontFamily: loaded ? fontFamilyCSS : 'system-ui', 
            fontSize: `${fontSize}px`, 
            fontWeight, 
            color: textColor,
            lineHeight: 1.3,
            textAlign: 'center',
            direction: font.language === 'arabic' ? 'rtl' : 'ltr',
            opacity: loaded ? 1 : 0.4,
            transition: 'opacity 0.2s',
          }}
        >
          {previewText.split('\n').map((line, i) => (
            <div key={i} style={{ marginBottom: i === previewText.split('\n').length - 1 ? 0 : '0.5em' }}>{line}</div>
          ))}
        </div>
      </div>
      
      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={handleApply} disabled={!loaded} className={styles.primaryBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Type size={14} /> Apply to Selection
        </button>
        <button onClick={handleCopyCSS} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Copy size={14} /> Copy @import CSS
        </button>
        <button onClick={handleDownloadSVG} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} /> Download Preview SVG
        </button>
        {loaded && (
          <button onClick={handleLoadFont} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ALargeSmall size={14} /> Reload Font
          </button>
        )}
      </div>
    </div>
  )
}