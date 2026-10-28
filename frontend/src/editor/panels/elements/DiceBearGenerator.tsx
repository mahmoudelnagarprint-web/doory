import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { Download, RefreshCw, Dice1, Copy, Image as ImageIcon } from 'lucide-react'
import { fetchDiceBearSvg, DICEBEAR_STYLES, type DiceBearStyle } from '@/lib/api/megaAssets'
import styles from './ElementsPanel.module.css'

export interface DiceBearGeneratorProps {
  style: DiceBearStyle
  seed: string
  onInsert: (style: DiceBearStyle, seed: string) => void
}

export function DiceBearGenerator({ style, seed, onInsert }: DiceBearGeneratorProps) {
  const [svg, setSvg] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchSeeds, setBatchSeeds] = useState<string[]>([])
  const [showBatch, setShowBatch] = useState(false)
  
  const styleInfo = DICEBEAR_STYLES.find(s => s.id === style)
  
  // Generate SVG when style or seed changes
  const generate = useCallback(async () => {
    if (!seed.trim()) return
    setLoading(true)
    setError(null)
    try {
      const svgMarkup = await fetchDiceBearSvg(style, seed)
      setSvg(svgMarkup)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate')
      setSvg('')
    } finally {
      setLoading(false)
    }
  }, [style, seed])
  
  // Trigger generation when style/seed changes (initial load)
  useEffect(() => {
    let active = true
    const doGenerate = async () => {
      if (!seed.trim()) return
      setLoading(true)
      setError(null)
      try {
        const svgMarkup = await fetchDiceBearSvg(style, seed)
        if (active) setSvg(svgMarkup)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to generate')
        if (active) setSvg('')
      } finally {
        if (active) setLoading(false)
      }
    }
    doGenerate()
    return () => { active = false }
  }, [style, seed])
  
  const handleInsert = useCallback(() => {
    if (svg) onInsert(style, seed)
  }, [svg, style, seed, onInsert])
  
  const generateBatch = useCallback(() => {
    const seeds: string[] = []
    const base = seed || 'sticker'
    for (let i = 0; i < 12; i++) {
      seeds.push(`${base}-${i}`)
    }
    setBatchSeeds(seeds)
    setShowBatch(true)
  }, [seed])
  
  const copySvg = useCallback(async () => {
    if (!svg) return
    try {
      await navigator.clipboard.writeText(svg)
    } catch {
      // ignore clipboard errors
    }
  }, [svg])
  
  const downloadSvg = useCallback(() => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dicebear-${style}-${seed}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }, [svg, style, seed])
  
  return (
    <div className={styles.dicebearGenerator} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Style info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: 'var(--ed-surface-2)', borderRadius: 8, border: '1px solid var(--ed-border)' }}>
        <span style={{ fontSize: 24 }}>{styleInfo?.preview}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{styleInfo?.label}</div>
          <div style={{ fontSize: 11, color: 'var(--ed-text-dim)' }}>Seed: <code>{seed}</code></div>
        </div>
      </div>
      
      {/* Preview */}
      <div style={{ 
        borderRadius: 12, 
        overflow: 'hidden', 
        background: 'var(--ed-surface-2)',
        border: '1px solid var(--ed-border)',
        aspectRatio: '1',
        minHeight: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--ed-text-dim)' }}>
            <Spinner />
            <span>Generating...</span>
          </div>
        )}
        {error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--ed-error)', padding: 16, textAlign: 'center' }}>
            <span>Failed to generate</span>
            <button type="button" onClick={generate} className={styles.actionBtn} style={{ marginTop: 8 }}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}
        {svg && !loading && !error && (
          <div 
            style={{ width: '100%', height: '100%', padding: 20 }} 
            dangerouslySetInnerHTML={{ __html: svg }} 
          />
        )}
        {!svg && !loading && !error && (
          <div style={{ color: 'var(--ed-text-dim)', textAlign: 'center' }}>Enter a seed to generate</div>
        )}
      </div>
      
      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleInsert}
          disabled={!svg || loading}
          className={styles.primaryBtn}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}
        >
          <Dice1 size={14} /> Insert to Canvas
        </button>
        <button
          type="button"
          onClick={copySvg}
          disabled={!svg}
          className={styles.actionBtn}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          title="Copy SVG to clipboard"
        >
          <Copy size={14} /> Copy SVG
        </button>
        <button
          type="button"
          onClick={downloadSvg}
          disabled={!svg}
          className={styles.actionBtn}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          title="Download SVG"
        >
          <Download size={14} /> Download
        </button>
        <button
          type="button"
          onClick={generateBatch}
          className={styles.actionBtn}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ImageIcon size={14} /> Batch (12)
        </button>
      </div>
      
      {/* Batch preview */}
      {showBatch && batchSeeds.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h5 style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>Batch Preview (click to insert)</h5>
            <button type="button" onClick={() => setShowBatch(false)} style={{ background: 'none', border: 'none', color: 'var(--ed-text-dim)', cursor: 'pointer', padding: 4 }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
            {batchSeeds.map((batchSeed) => (
              <BatchStickerItem
                key={batchSeed}
                style={style}
                seed={batchSeed}
                onInsert={onInsert}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Batch sticker item component
function BatchStickerItem({ style, seed, onInsert }: { style: DiceBearStyle; seed: string; onInsert: (style: DiceBearStyle, seed: string) => void }) {
  const [svg, setSvg] = useState<string>('')
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    let active = true
    fetchDiceBearSvg(style, seed).then(s => {
      if (active) { setSvg(s); setLoading(false) }
    }).catch(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [style, seed])
  
  return (
    <div 
      style={{ 
        aspectRatio: '1', 
        borderRadius: 8, 
        background: 'var(--ed-surface-2)',
        border: '1px solid var(--ed-border)',
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={() => { if (svg) onInsert(style, seed) }}
      title={seed}
    >
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      )}
      {svg && !loading && (
        <div style={{ width: '100%', height: '100%', padding: 8 }} dangerouslySetInnerHTML={{ __html: svg }} />
      )}
      {!loading && !svg && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ed-text-dim)', fontSize: 10 }}>Failed</div>}
      <div style={{ position: 'absolute', bottom: 2, left: 2, right: 2, fontSize: 8, color: 'var(--ed-text-dim)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {seed}
      </div>
    </div>
  )
}

// Spinner component
function Spinner() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.style.cssText = `
        width: 24px; height: 24px; border: 2px solid var(--ed-border); border-top-color: var(--ed-accent);
        border-radius: 50%; animation: spin 0.8s linear infinite;
      `
    }
  }, [])
  return <div ref={ref} />
}

// Inject spinner keyframes once
if (typeof document !== 'undefined' && !document.getElementById('dicebear-spinner-style')) {
  const styleEl = document.createElement('style')
  styleEl.id = 'dicebear-spinner-style'
  styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } }'
  document.head.appendChild(styleEl)
}