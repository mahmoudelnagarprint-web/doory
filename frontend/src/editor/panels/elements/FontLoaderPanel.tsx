import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { Search, Copy, Check, Loader2 } from 'lucide-react'
import { fetchFontsourceCatalog, getPinnedFonts, loadFont, getFontFamilyCSS, type FontDefinition } from '@/lib/api/fontsource'
import { useEditor } from '../../context'
import styles from './ElementsPanel.module.css'

const FontPreview = lazy(() => import('./FontPreview').then(m => ({ default: m.FontPreview })))

export function FontLoaderPanel() {
  const editor = useEditor()
  const [searchQuery, setSearchQuery] = useState('')
  const [languageFilter, setLanguageFilter] = useState<'all' | 'arabic' | 'latin' | 'both'>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace'>('all')
  const [selectedFont, setSelectedFont] = useState<FontDefinition | null>(null)
  const [loadingFonts, setLoadingFonts] = useState<Set<string>>(new Set())
  
  // Initialize with pinned fonts (renders immediately without effect)
  const initialPinned = getPinnedFonts()
  const [allFonts, setAllFonts] = useState<FontDefinition[]>(initialPinned)
  const [loading, setLoading] = useState(true)
  
  // Fetch full catalog in background
  useEffect(() => {
    let active = true
    fetchFontsourceCatalog().then(data => {
      if (active) {
        // Merge with pinned, avoiding duplicates
        const existing = new Set(initialPinned.map(f => f.family))
        const merged = [...initialPinned, ...data.filter(f => !existing.has(f.family))]
        setAllFonts(merged)
      }
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])
  
  // Initialize loaded fonts with pinned fonts
  const initialLoaded = new Set(initialPinned.map(f => f.family))
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(initialLoaded)
  
  // Filter fonts
  const filteredFonts = allFonts.filter(font => {
    if (languageFilter !== 'all' && font.language !== languageFilter && font.language !== 'both') return false
    if (categoryFilter !== 'all' && font.category !== categoryFilter) return false
    return font.family.toLowerCase().includes(searchQuery.toLowerCase())
  })
  
  const handleFontLoad = useCallback(async (font: FontDefinition) => {
    if (loadedFonts.has(font.family) || loadingFonts.has(font.family)) return
    
    const newLoading = new Set(loadingFonts)
    newLoading.add(font.family)
    setLoadingFonts(newLoading)
    
    try {
      await loadFont(font)
      setLoadedFonts(prev => new Set([...prev, font.family]))
    } catch (e) {
      console.warn(`Failed to load font ${font.family}:`, e)
    } finally {
      setLoadingFonts(prev => {
        const next = new Set(prev)
        next.delete(font.family)
        return next
      })
    }
  }, [loadingFonts, loadedFonts])
  
  const applyToSelection = useCallback((font: FontDefinition) => {
    const textObjects = editor.selectedObjects().filter(o => o.type === 'textbox' || o.type === 'text')
    if (textObjects.length === 0) {
      editor.toast('Select text elements first', 'info')
      return
    }
    
    editor.style.text({ fontFamily: getFontFamilyCSS(font) })
    editor.toast(`Applied "${font.family}" to ${textObjects.length} text elements`, 'success')
  }, [editor])
  
  const copyFontCSS = useCallback(async (font: FontDefinition) => {
    const css = `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family)}:wght@${font.variants.join(';')}&display=swap&subset=${font.subsets.join(',')}');\n\nfont-family: "${font.family}", ${font.fallback || 'system-ui, sans-serif'};`
    await navigator.clipboard.writeText(css)
  }, [])
  
  const isLoaded = (family: string) => loadedFonts.has(family)
  const isLoading = (family: string) => loadingFonts.has(family)
  
  if (loading && allFonts.length === 0) {
    return (
      <div className={styles.fontLoaderPanel} style={{ padding: 16, textAlign: 'center' }}>
        <Loader2 className={styles.spinner} size={32} />
        <p style={{ marginTop: 8, color: 'var(--ed-text-dim)' }}>Loading font catalog...</p>
      </div>
    )
  }
  
  return (
    <div className={styles.fontLoaderPanel} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 12, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ed-text-dim)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search fonts..."
            style={{ width: '100%', padding: '8px 10px 8px 36px', borderRadius: 6, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}
          />
        </div>
        <select
          value={languageFilter}
          onChange={e => setLanguageFilter(e.target.value as 'all' | 'arabic' | 'latin' | 'both')}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}
        >
          <option value="all">All Languages</option>
          <option value="arabic">Arabic</option>
          <option value="latin">Latin</option>
          <option value="both">Both</option>
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value as 'all' | 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace')}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', fontSize: 13 }}
        >
          <option value="all">All Categories</option>
          <option value="sans-serif">Sans Serif</option>
          <option value="serif">Serif</option>
          <option value="display">Display</option>
          <option value="handwriting">Handwriting</option>
          <option value="monospace">Monospace</option>
        </select>
      </div>
      
      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--ed-text-dim)', padding: '0 4px' }}>
        <span>Total: <strong>{allFonts.length}</strong> fonts</span>
        <span>Loaded: <strong>{loadedFonts.size}</strong></span>
        <span>Arabic: <strong>{allFonts.filter(f => f.language === 'arabic').length}</strong></span>
        <span>Latin: <strong>{allFonts.filter(f => f.language === 'latin').length}</strong></span>
      </div>
      
      {/* Font Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
        {filteredFonts.map(font => {
          const loaded = isLoaded(font.family)
          const loading = isLoading(font.family)
          
          return (
            <div
              key={font.family}
              className={`${styles.fontCard} ${selectedFont?.family === font.family ? styles.selected : ''}`}
              onClick={() => setSelectedFont(font)}
              style={{
                padding: 12,
                background: 'var(--ed-surface-2)',
                borderRadius: 8,
                border: `2px solid ${selectedFont?.family === font.family ? 'var(--ed-accent)' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {/* Font Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, fontFamily: loaded ? getFontFamilyCSS(font) : 'system-ui', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {font.family}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--ed-surface-3)', borderRadius: 9999, color: 'var(--ed-text-dim)' }}>
                      {font.language === 'arabic' ? '🇸🇦 Arabic' : font.language === 'latin' ? '🇺🇸 Latin' : '🌐 Both'}
                    </span>
                    <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--ed-surface-3)', borderRadius: 9999, color: 'var(--ed-text-dim)' }}>
                      {font.category}
                    </span>
                    {font.variants.length > 3 && (
                      <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--ed-surface-3)', borderRadius: 9999, color: 'var(--ed-text-dim)' }}>
                        {font.variants.length} weights
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Load/Loaded indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {loading && <Loader2 className={styles.spinner} size={16} />}
                  {loaded && !loading && <Check size={16} style={{ color: 'var(--ed-success)' }} />}
                  {!loaded && !loading && (
                    <button
                      onClick={e => { e.stopPropagation(); handleFontLoad(font) }}
                      style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', cursor: 'pointer' }}
                    >
                      Load
                    </button>
                  )}
                </div>
              </div>
              
              {/* Preview Text */}
              <div style={{ 
                fontFamily: loaded ? getFontFamilyCSS(font) : 'system-ui', 
                fontSize: 18, 
                lineHeight: 1.4,
                marginTop: 8,
                padding: 8,
                background: 'var(--ed-surface-3)',
                borderRadius: 6,
                minHeight: 60,
                opacity: loaded ? 1 : 0.5,
              }}>
                {font.language === 'arabic' || font.language === 'both' ? (
                  <>
                    <div dir="rtl" style={{ marginBottom: 4 }}>مرحباً بالعالم</div>
                    <div>Hello World</div>
                  </>
                ) : (
                  <div>Hello World</div>
                )}
                <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                  {font.variants.slice(0, 5).map((w) => (
                    <span key={w} style={{ fontWeight: w, marginRight: 8 }}>{w}</span>
                  ))}
                  {font.variants.length > 5 && <span>+{font.variants.length - 5} more</span>}
                </div>
              </div>
              
              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--ed-border)' }}>
                <button
                  onClick={e => { e.stopPropagation(); handleFontLoad(font) }}
                  disabled={loaded || loading}
                  style={{ flex: 1, padding: '6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--ed-border)', background: loaded ? 'var(--ed-success)' : 'var(--ed-surface-3)', color: loaded ? '#fff' : 'var(--ed-text)', cursor: loaded || loading ? 'not-allowed' : 'pointer', opacity: loaded || loading ? 0.7 : 1 }}
                >
                  {loading ? 'Loading...' : loaded ? '✓ Loaded' : 'Load Font'}
                </button>
                <button onClick={e => { e.stopPropagation(); applyToSelection(font) }} disabled={!loaded} style={{ padding: '6px 10px', fontSize: 11, borderRadius: 4, border: '1px solid var(--ed-border)', background: loaded ? 'var(--ed-accent)' : 'var(--ed-surface-3)', color: loaded ? '#fff' : 'var(--ed-text-dim)', cursor: loaded ? 'pointer' : 'not-allowed', opacity: loaded ? 1 : 0.5 }}>
                  Apply
                </button>
                <button onClick={e => { e.stopPropagation(); copyFontCSS(font) }} style={{ padding: '6px', borderRadius: 4, border: '1px solid var(--ed-border)', background: 'var(--ed-surface-3)', color: 'var(--ed-text)', cursor: 'pointer' }} title="Copy @import CSS">
                  <Copy size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Selected Font Details */}
      {selectedFont && (
        <Suspense fallback={<div className={styles.skeleton} style={{ height: 200 }} />}>
          <FontPreview font={selectedFont} onApply={applyToSelection} onCopyCSS={copyFontCSS} />
        </Suspense>
      )}
    </div>
  )
}