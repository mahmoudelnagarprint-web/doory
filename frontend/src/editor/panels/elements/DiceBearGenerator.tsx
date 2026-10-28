import { useState, useMemo, useEffect } from 'react'
import { RefreshCw, Dice1 } from 'lucide-react'
import { fetchDiceBearSvg, DICEBEAR_STYLES, type DiceBearStyle } from '@/lib/api/megaAssets'
import styles from './ElementsPanel.module.css'

export interface DiceBearGeneratorProps {
  style: DiceBearStyle
  seed: string
  onInsert: (style: DiceBearStyle, seed: string) => void
}

const VARIATION_COUNT = 12

/** Pool of readable suffixes; each shuffle rotates through it (pure, no Math.random). */
const SUFFIX_POOL = [
  'sun', 'moon', 'star', 'cloud', 'leaf', 'wave',
  'fire', 'rain', 'snow', 'dawn', 'dusk', 'mist',
  'lily', 'rose', 'fern', 'opal', 'onyx', 'ruby',
  'jade', 'amber', 'coral', 'pearl', 'maple', 'cedar',
]

/** Build the 12 variation seeds from a base seed, rotated by the shuffle offset. */
function buildVariationSeeds(baseSeed: string, offset = 0): string[] {
  const base = baseSeed.trim() || 'doory'
  const start = (offset * 5) % SUFFIX_POOL.length
  return Array.from({ length: VARIATION_COUNT }, (_, i) => {
    const suffix = SUFFIX_POOL[(start + i) % SUFFIX_POOL.length]
    return `${base}-${suffix}`
  })
}

/**
 * Grid of 12 DiceBear variations for the selected style.
 * Every cell loads its own SVG and inserts on click — standard asset-library experience.
 */
export function DiceBearGenerator({ style, seed, onInsert }: DiceBearGeneratorProps) {
  const [shuffleOffset, setShuffleOffset] = useState(0)

  // Reset the shuffle rotation when the style or base seed changes (render-phase adjustment).
  const viewKey = `${style}:${seed}`
  const [prevKey, setPrevKey] = useState(viewKey)
  if (prevKey !== viewKey) {
    setPrevKey(viewKey)
    setShuffleOffset(0)
  }

  const seeds = useMemo(() => buildVariationSeeds(seed, shuffleOffset), [seed, shuffleOffset])

  const handleShuffle = () => setShuffleOffset((n) => n + 1)

  const styleInfo = DICEBEAR_STYLES.find(s => s.id === style)

  return (
    <div className={styles.dicebearGenerator} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header: style label + shuffle button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 22 }}>{styleInfo?.preview}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{styleInfo?.label}</div>
            <div style={{ fontSize: 11, color: 'var(--ed-text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {VARIATION_COUNT} variations · click to insert
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleShuffle}
          className={styles.actionBtn}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none' }}
          title="Generate 12 new variations"
        >
          <RefreshCw size={13} /> Shuffle
        </button>
      </div>

      {/* Grid of 12 variations */}
      <div className={styles.dicebearGrid}>
        {seeds.map((variationSeed) => (
          <DiceBearCell key={`${style}-${variationSeed}`} style={style} seed={variationSeed} onInsert={onInsert} />
        ))}
      </div>
    </div>
  )
}

/**
 * One clickable DiceBear variation cell. Loads its own SVG; click inserts.
 * `null` = loading, `''` = failed, markup = ready (derived state, no flag juggling).
 */
function DiceBearCell({ style, seed, onInsert }: { style: DiceBearStyle; seed: string; onInsert: (style: DiceBearStyle, seed: string) => void }) {
  const [svg, setSvg] = useState<string | null>(null)

  // Render-phase adjustment: when this cell is recycled for a new style/seed, mark it stale.
  const cacheKey = `${style}:${seed}`
  const [loadedKey, setLoadedKey] = useState(cacheKey)
  if (loadedKey !== cacheKey) {
    setLoadedKey(cacheKey)
    setSvg(null)
  }

  // Async work lives in the effect; setState only happens in the async callbacks.
  useEffect(() => {
    let active = true
    fetchDiceBearSvg(style, seed)
      .then((markup) => { if (active) setSvg(markup) })
      .catch(() => { if (active) setSvg('') })
    return () => { active = false }
  }, [style, seed])

  const loading = svg === null
  const failed = svg === ''

  return (
    <button
      type="button"
      className={styles.dicebearCell}
      onClick={() => { if (svg) onInsert(style, seed) }}
      disabled={loading || failed || !svg}
      title={failed ? `${seed} (failed)` : `${seed} — click to insert`}
      aria-label={`Insert DiceBear ${style} variation ${seed}`}
    >
      {loading && <div className={styles.spinner} style={{ width: 18, height: 18 }} />}
      {failed && <span style={{ fontSize: 9, color: 'var(--ed-text-dim)' }}>—</span>}
      {!loading && !failed && svg && (
        <div className={styles.dicebearCellArt} dangerouslySetInnerHTML={{ __html: svg }} />
      )}
      {!loading && !failed && !svg && <Dice1 size={16} style={{ color: 'var(--ed-text-dim)' }} />}
    </button>
  )
}