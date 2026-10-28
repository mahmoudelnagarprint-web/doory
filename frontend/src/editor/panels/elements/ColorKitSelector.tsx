import { useState, useCallback } from 'react'
import { Palette, Copy, Download, Wand2 } from 'lucide-react'
import { COLOR_KITS, colorKitToCSS, shuffleColorKit, type ColorKit } from '@/lib/api/gradients'
import { useEditor } from '../../context'
import styles from './ElementsPanel.module.css'

export function ColorKitSelector() {
  const editor = useEditor()
  const [selectedKit, setSelectedKit] = useState<ColorKit | null>(COLOR_KITS[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [category, setCategory] = useState<'all' | 'dark' | 'light' | 'vibrant' | 'pastel' | 'neutral'>('all')
  
  const filteredKits = COLOR_KITS.filter(kit => {
    if (category !== 'all') {
      if (category === 'dark' && !kit.tags.includes('dark')) return false
      if (category === 'light' && !kit.tags.some(t => ['light', 'clean', 'fresh', 'soft'].includes(t))) return false
      if (category === 'vibrant' && !kit.tags.some(t => ['neon', 'bold', 'energy', 'tropical', 'passion'].includes(t))) return false
      if (category === 'pastel' && !kit.tags.includes('pastel') && !kit.tags.includes('soft')) return false
      if (category === 'neutral' && !kit.tags.some(t => ['minimal', 'clean', 'modern', 'steel', 'calm'].includes(t))) return false
    }
    return kit.name.toLowerCase().includes(searchQuery.toLowerCase())
  })
  
  const applyToPage = useCallback(async (kit: ColorKit) => {
    try {
      const cssVars = colorKitToCSS(kit)
      const pageId = editor.state.activePageId
      
      // Apply to page background
      editor.pages.setBackground(pageId, { type: 'solid', color: kit.colors[0] })
      
      // Apply CSS custom properties to document root for global use
      const root = document.documentElement
      Object.entries(cssVars).forEach(([key, value]) => {
        root.style.setProperty(key, value)
      })
      
      // Apply to selected objects
      recolorSelection(editor, kit.colors)
      
      editor.toast(`Applied "${kit.name}" color kit`, 'success')
    } catch {
      editor.toast('Failed to apply color kit', 'error')
    }
  }, [editor])
  
  const applyToSelection = useCallback((kit: ColorKit) => {
    const count = recolorSelection(editor, kit.colors)
    if (count === 0) {
      editor.toast('Select elements first', 'info')
      return
    }
    editor.toast(`Applied "${kit.name}" to ${count} elements`, 'success')
  }, [editor])
  
  const shuffleAndApply = useCallback((kit: ColorKit) => {
    const shuffled = shuffleColorKit(kit)
    const cssVars = {
      '--kit-color-1': shuffled[0],
      '--kit-color-2': shuffled[1],
      '--kit-color-3': shuffled[2],
      '--kit-color-4': shuffled[3],
      '--kit-color-5': shuffled[4],
    }
    
    const root = document.documentElement
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })
    
    // Apply to selection with shuffled colors
    recolorSelection(editor, shuffled)
    
    editor.toast(`Shuffled & applied "${kit.name}"`, 'success')
  }, [editor])
  
  const copyCSS = useCallback(async (kit: ColorKit) => {
    const cssVars = colorKitToCSS(kit)
    const css = Object.entries(cssVars).map(([k, v]) => `  ${k}: ${v};`).join('\n')
    await navigator.clipboard.writeText(`:root {\n${css}\n}`)
  }, [])
  
  const downloadPalette = useCallback((kit: ColorKit) => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200" viewBox="0 0 800 200">
  ${kit.colors.map((c, i) => `<rect x="${i * 160}" y="0" width="160" height="200" fill="${c}"/>`).join('')}
  ${kit.colors.map((c, i) => `<text x="${i * 160 + 80}" y="190" text-anchor="middle" font-family="system-ui" font-size="14" fill="${getContrastColor(c)}">${c}</text>`).join('')}
  <text x="400" y="30" text-anchor="middle" font-family="system-ui" font-size="18" font-weight="bold" fill="#333">${kit.name}</text>
</svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `color-kit-${kit.id}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }, [])
  
  return (
    <div className={styles.colorKitSelector} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 12, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Palette size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ed-text-dim)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search color kits..."
            style={{ width: '100%', padding: '8px 10px 8px 36px', borderRadius: 6, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}
          />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as 'all' | 'dark' | 'light' | 'vibrant' | 'pastel' | 'neutral')}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}
        >
          <option value="all">All</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="vibrant">Vibrant</option>
          <option value="pastel">Pastel</option>
          <option value="neutral">Neutral</option>
        </select>
      </div>
      
      {/* Color Kit Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {filteredKits.map(kit => (
          <div
            key={kit.id}
            className={`${styles.colorKitCard} ${selectedKit?.id === kit.id ? styles.selected : ''}`}
            onClick={() => setSelectedKit(kit)}
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              cursor: 'pointer',
              border: '2px solid transparent',
              transition: 'border-color 0.15s, transform 0.15s',
              background: 'var(--ed-surface-2)',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--ed-accent)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'transparent' }}
          >
            {/* Color Swatches */}
            <div style={{ display: 'flex', height: 80 }}>
              {kit.colors.map((c, i) => (
                <div key={i} style={{ flex: 1, background: c, position: 'relative' }}>
                  <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 10, color: getContrastColor(c), fontWeight: 600 }}>{c}</span>
                </div>
              ))}
            </div>
            
            {/* Info */}
            <div style={{ padding: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{kit.name}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {kit.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 10, padding: '2px 6px', background: 'var(--ed-surface-3)', borderRadius: 9999, color: 'var(--ed-text-dim)' }}>{tag}</span>
                ))}
              </div>
            </div>
            
            {/* Actions on hover */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', gap: 4, padding: 8, opacity: 0, transition: 'opacity 0.2s', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
              <button onClick={e => { e.stopPropagation(); applyToPage(kit) }} style={{ flex: 1, padding: '6px', background: 'var(--ed-accent)', border: 'none', borderRadius: 4, color: 'var(--ed-surface)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }} title="Apply to page">
                Apply to Page
              </button>
              <button onClick={e => { e.stopPropagation(); applyToSelection(kit) }} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' }} title="Apply to selection">
                Selection
              </button>
              <button onClick={e => { e.stopPropagation(); shuffleAndApply(kit) }} style={{ padding: '6px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }} title="Shuffle & Apply">
                <Wand2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Selected Kit Actions */}
      {selectedKit && (
        <div style={{ display: 'flex', gap: 8, padding: 12, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
            {selectedKit.colors.map((c, i) => (
              <div key={i} style={{ width: 40, height: 40, borderRadius: 8, background: c, border: '2px solid var(--ed-border)', position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); copyColor(c) }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', border: 'none', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0'} title={`Copy ${c}`}>
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: getContrastColor(c), fontSize: 10, fontWeight: 600 }}>{c}</span>
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => applyToPage(selectedKit)} className={styles.primaryBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Palette size={14} /> Apply to Page
            </button>
            <button onClick={() => applyToSelection(selectedKit)} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Wand2 size={14} /> Apply to Selection
            </button>
            <button onClick={() => shuffleAndApply(selectedKit)} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Wand2 size={14} /> Shuffle & Apply
            </button>
            <button onClick={() => copyCSS(selectedKit)} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Copy size={14} /> Copy CSS
            </button>
            <button onClick={() => downloadPalette(selectedKit)} className={styles.actionBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Download size={14} /> Download
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function recolorSelection(editor: ReturnType<typeof useEditor>, colors: readonly string[]): number {
  const ids = editor.state.selection.ids
  if (ids.length === 0 || colors.length === 0) return 0
  ids.forEach((id, i) => {
    editor.select([id])
    editor.style.setFill({ type: 'solid', color: colors[i % colors.length] })
  })
  editor.select(ids)
  return ids.length
}

function getContrastColor(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

function copyColor(color: string) {
  navigator.clipboard.writeText(color)
}