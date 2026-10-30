import { useCallback, useEffect, useRef, useState, Suspense, lazy } from 'react'
import { useLatest } from '../../hooks/useLatest'
import { ArrowLeft, Search, X, Sparkles, Palette, Image, Shapes, Box, Layers } from 'lucide-react'
import { fetchIconSvg, iconPreviewUrl, parseIconId, searchIcons } from '@/lib/api/iconify'
import type { IconifyIcon } from '@/types/api'
import { DICEBEAR_STYLES, type DiceBearStyle, fetchDiceBearSvg, getDiceBearUrl, colorizeUndrawSvg } from '@/lib/api/megaAssets'
import type { UndrawItem } from '@/lib/api/undraw'
import { searchUndraw } from '@/lib/api/undraw'
import {
  getBlobFrame,
  generateRandomBlobFrame,
  PATTERN_DEFINITIONS,
  frameMask,
  BLOB_SEEDS,
  type PatternDefinition,
  type PatternOptions,
  applyPatternToRect,
} from './FramesAndShapesCatalog'
import { useEditor } from '../../context'
import { setAssetDrag } from '../../drawers/assetDrag'
import { useDebounced } from '../../hooks/useDebounced'
import { t } from '../../strings'
import { Skeleton } from '../../ui/Skeleton'
import { FrameArtwork, NATIVE_FRAMES, type FrameDefinition as ThumbFrame } from './FrameThumb'
import styles from './ElementsPanel.module.css'

// ============================================
// TYPES & CONSTANTS
// ============================================

export type ElementCategory = 'all' | 'shapes' | 'illustrations' | 'frames' | 'patterns' | 'generated'

const CATEGORIES: Array<{ id: ElementCategory; label: string; icon: React.ReactNode }> = [
  { id: 'all', label: 'All', icon: <Layers size={16} /> },
  { id: 'shapes', label: 'Shapes', icon: <Shapes size={16} /> },
  { id: 'illustrations', label: 'Illustrations', icon: <Image size={16} /> },
  { id: 'frames', label: 'Frames', icon: <Box size={16} /> },
  { id: 'patterns', label: 'Patterns', icon: <Palette size={16} /> },
  { id: 'generated', label: 'AI Stickers', icon: <Box size={16} /> },
]

const SHAPES_PAGE_SIZE = 60

// ============================================
// SUB-COMPONENTS (lazy-loaded for bundle size)
// ============================================

const UndrawColorPicker = lazy(() => import('./UndrawColorPicker').then(m => ({ default: m.UndrawColorPicker })))
const PatternEditor = lazy(() => import('./PatternEditor').then(m => ({ default: m.PatternEditor })))
const DiceBearGenerator = lazy(() => import('./DiceBearGenerator').then(m => ({ default: m.DiceBearGenerator })))

// ============================================
// MAIN COMPONENT
// ============================================

export function ElementsPanel() {
  const editor = useEditor()
  const [selectedCategory, setCategory] = useState<ElementCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedQuery = useDebounced(searchQuery.trim(), 300)

  // Carousel data for "All" view. Previews load once on mount, so the flag starts true.
  const [previewIllustrations, setPreviewIllustrations] = useState<UndrawItem[]>([])
  const [previewGenerated, setPreviewGenerated] = useState<string[]>([])
  const [loadingPreviews, setLoadingPreviews] = useState(true)

  // Category grid states
  const [iconifyResults, setIconifyResults] = useState<IconifyIcon[]>([])
  const [elementResults, setElementResults] = useState<UndrawItem[]>([])
  const [loadingCategory, setLoadingCategory] = useState(false)
  const [hasMoreCategory, setHasMoreCategory] = useState(false)

  // Infinite scroll refs
  const gridRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // unDraw color picker state
  const [undrawPrimaryColor, setUndrawPrimaryColor] = useState('#7c5cff')

  // Pattern editor state
  const [selectedPattern, setSelectedPattern] = useState<PatternDefinition | null>(null)
  const [patternOptions, setPatternOptions] = useState<PatternOptions>({
    primaryColor: '#7c5cff',
    backgroundColor: 'transparent',
    scale: 1,
    opacity: 1,
    rotation: 0,
  })

  // DiceBear state
  const [dicebearStyle, setDicebearStyle] = useState<DiceBearStyle>('fun-emoji')
  const [dicebearSeed, setDicebearSeed] = useState('doory-sticker')

  // ============================================
  // EFFECTS
  // ============================================

  // Load previews for "All" view
  useEffect(() => {
    let active = true

    Promise.allSettled([
      searchUndraw(''),
      (async () => {
        const seeds = ['happy', 'cool', 'fun', 'robot', 'magic', 'nature']
        const urls = await Promise.all(seeds.map(s => getDiceBearUrl('fun-emoji', s)))
        return urls
      })(),
    ]).then(([illRes, genRes]) => {
      if (!active) return
      if (illRes.status === 'fulfilled') setPreviewIllustrations(illRes.value.slice(0, 12))
      if (genRes.status === 'fulfilled') setPreviewGenerated(genRes.value)
    }).finally(() => {
      if (active) setLoadingPreviews(false)
    })

    return () => { active = false }
  }, [])

  // Handle category/search change
  useEffect(() => {
    if (selectedCategory === 'all' && !debouncedQuery) return

    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the loading flag for the new category before the async load starts
    setLoadingCategory(true)

    const searchingAll = selectedCategory === 'all' && !!debouncedQuery

    const loadCategory = async () => {
      setLoadingCategory(true)
      try {
        if (selectedCategory === 'shapes') {
          const q = debouncedQuery || 'shape arrow'
          const res = await searchIcons(q, { start: 0, limit: SHAPES_PAGE_SIZE })
          if (!active) return
          setIconifyResults(debouncedQuery ? res.icons : [])
          setHasMoreCategory(res.nextStart !== null)
        } else if (selectedCategory === 'illustrations') {
          const items = await searchUndraw(debouncedQuery)
          if (!active) return
          setElementResults(items)
          setHasMoreCategory(false)
        } else if (selectedCategory === 'frames') {
          // Frames don't paginate
          if (!active) return
          setHasMoreCategory(false)
        } else if (selectedCategory === 'patterns') {
          if (!active) return
          setHasMoreCategory(false)
        } else if (selectedCategory === 'generated') {
          if (!active) return
          setHasMoreCategory(false)
        }

        if (searchingAll) {
          const [shapes, illustrations] = await Promise.allSettled([
            searchIcons(debouncedQuery, { start: 0, limit: 36 }),
            searchUndraw(debouncedQuery),
          ])
          if (!active) return
          setIconifyResults(shapes.status === 'fulfilled' ? shapes.value.icons : [])
          setElementResults(illustrations.status === 'fulfilled' ? illustrations.value : [])
          setHasMoreCategory(false)
        }
      } finally {
        if (active) setLoadingCategory(false)
      }
    }

    loadCategory()

    return () => { active = false }
  }, [selectedCategory, debouncedQuery])
  
  // Load more for infinite scroll
  const loadMore = useCallback(async () => {
    if (loadingCategory || !hasMoreCategory) return
    
    const nextStart = selectedCategory === 'shapes' ? iconifyResults.length : 0
    
    if (nextStart === 0 && selectedCategory !== 'shapes') return
    
    setLoadingCategory(true)
    
    try {
      if (selectedCategory === 'shapes') {
        const q = debouncedQuery || 'shape arrow'
        const res = await searchIcons(q, { start: nextStart, limit: SHAPES_PAGE_SIZE })
        setIconifyResults(prev => [...prev, ...res.icons])
        setHasMoreCategory(res.nextStart !== null)
      }
    } finally {
      setLoadingCategory(false)
    }
  }, [loadingCategory, hasMoreCategory, selectedCategory, debouncedQuery, iconifyResults.length])
  
  const loadMoreRef = useLatest(loadMore)
  
  // IntersectionObserver for infinite scroll.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !sentinelRef.current || loadingCategory || !hasMoreCategory) return

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingCategory && hasMoreCategory) {
        loadMoreRef.current()
      }
    }, { rootMargin: '200px' })

    observerRef.current.observe(sentinelRef.current)
    return () => observerRef.current?.disconnect()
  }, [loadingCategory, hasMoreCategory, selectedCategory, debouncedQuery, loadMoreRef])
  
  // ============================================
  // INSERTION HANDLERS
  // ============================================
  
  const insertIcon = useCallback(async (icon: IconifyIcon) => {
    try {
      const svg = await fetchIconSvg(icon)
      await editor.insert.svgElement(svg, `iconify:${icon.id}`, icon.label)
    } catch {
      editor.toast('Could not insert icon', 'error')
    }
  }, [editor])

  const insertUndraw = useCallback(async (item: UndrawItem) => {
    try {
      const res = await fetch(item.svgUrl, { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let svg = await res.text()
      // Apply colorization
      svg = colorizeUndrawSvg(svg, undrawPrimaryColor)
      await editor.insert.svgElement(svg, item.id, item.title)
    } catch {
      editor.toast('Could not insert illustration', 'error')
    }
  }, [editor, undrawPrimaryColor])
  
  const insertFrame = useCallback(async (frame: ThumbFrame) => {
    try {
      await editor.insert.placeholder(frameMask(frame))
    } catch {
      editor.toast('Could not insert frame', 'error')
    }
  }, [editor])

  const insertPattern = useCallback(async (pattern: PatternDefinition, fillPage = false) => {
    try {
      const page = editor.state.doc.pages.find(p => p.id === editor.state.activePageId)
      const pw = page?.width ?? 800, ph = page?.height ?? 600
      const w = fillPage ? pw : 800, h = fillPage ? ph : 600
      const svg = applyPatternToRect(pattern.id, w, h, patternOptions)
      await editor.insert.svgElement(svg, `pattern:${pattern.id}`, pattern.name, fillPage ? { x: w / 2, y: h / 2 } : undefined)
      editor.toast(fillPage ? `Applied "${pattern.name}" to full design` : `Inserted "${pattern.name}"`, 'success')
    } catch {
      editor.toast('Could not insert pattern', 'error')
    }
  }, [editor, patternOptions])

  const insertDiceBear = useCallback(async (style: DiceBearStyle, seed: string) => {
    try {
      const svg = await fetchDiceBearSvg(style, seed)
      await editor.insert.svgElement(svg, `dicebear:${style}:${seed}`, `DiceBear ${style}`)
    } catch {
      editor.toast('Could not generate sticker', 'error')
    }
  }, [editor])

  // ============================================
  // RENDER HELPERS
  // ============================================

  const isAllView = selectedCategory === 'all' && !debouncedQuery

  const renderGridItem = useCallback((
    icon: IconifyIcon,
    size: number,
    testId: string,
    onInsert: () => void
  ) => (
    <div
      key={icon.id}
      className={styles.gridItem}
      draggable
      title={icon.label}
      data-testid={testId}
      onDragStart={(e) => setAssetDrag(e.dataTransfer, { kind: 'iconify', id: icon.id, name: icon.label })}
      onClick={onInsert}
    >
      <img src={iconPreviewUrl(icon.id, size)} alt={icon.label} loading="lazy" />
    </div>
  ), [])

  const renderCarouselItem = useCallback((
    icon: IconifyIcon,
    testId: string,
    onInsert: () => void
  ) => (
    <div
      key={icon.id}
      className={styles.carouselItem}
      draggable
      title={icon.label}
      data-testid={testId}
      onDragStart={(e) => setAssetDrag(e.dataTransfer, { kind: 'iconify', id: icon.id, name: icon.label })}
      onClick={onInsert}
    >
      <img src={iconPreviewUrl(icon.id, 48)} alt={icon.label} loading="lazy" />
    </div>
  ), [])

  const renderUndrawCarouselItem = useCallback((item: UndrawItem) => (
    <div
      key={item.id}
      className={styles.carouselItem}
      draggable
      title={item.title}
      data-testid={`item-illustration-${item.id}`}
      onDragStart={(e) => setAssetDrag(e.dataTransfer, { kind: 'local', name: item.title, url: item.svgUrl, type: 'svg' })}
      onClick={() => void insertUndraw(item)}
    >
      <img src={item.thumbUrl} alt={item.title} loading="lazy" />
    </div>
  ), [insertUndraw])

  const renderUndrawGridItem = useCallback((item: UndrawItem) => (
    <div
      key={item.id}
      className={styles.gridItem}
      draggable
      title={item.title}
      data-testid={`grid-element-${item.id}`}
      onDragStart={(e) => setAssetDrag(e.dataTransfer, { kind: 'local', name: item.title, url: item.svgUrl, type: 'svg' })}
      onClick={() => void insertUndraw(item)}
    >
      <img src={item.thumbUrl} alt={item.title} loading="lazy" />
    </div>
  ), [insertUndraw])
  
  const renderFrameCarouselItem = useCallback((frame: ThumbFrame) => (
    <div
      key={frame.id}
      className={styles.carouselItem}
      draggable
      title={frame.name}
      data-testid={`item-frame-${frame.id}`}
      onDragStart={(e) => setAssetDrag(e.dataTransfer, { kind: 'frame', mask: frameMask(frame), name: frame.name })}
      onClick={() => void insertFrame(frame)}
    >
      <FrameArtwork path={frame.path} id={`carousel-${frame.id}`} />
    </div>
  ), [insertFrame])
  
  const renderFrameGridItem = useCallback((frame: ThumbFrame) => (
    <div
      key={frame.id}
      className={styles.gridItem}
      draggable
      title={frame.name}
      data-testid={`grid-frame-${frame.id}`}
      onDragStart={(e) => setAssetDrag(e.dataTransfer, { kind: 'frame', mask: frameMask(frame), name: frame.name })}
      onClick={() => void insertFrame(frame)}
    >
      <FrameArtwork path={frame.path} id={`grid-${frame.id}`} />
    </div>
  ), [insertFrame])

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className={styles.panel} data-testid="elements-panel">
      {/* Search Bar */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--ed-text-dim)', pointerEvents: 'none' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.panels.searchElements}
          data-testid="elements-search-input"
          style={{
            width: '100%',
            height: 36,
            paddingLeft: 34,
            paddingRight: searchQuery ? 30 : 12,
            borderRadius: 8,
            border: '1px solid var(--ed-border)',
            background: 'var(--ed-surface-2)',
            color: 'var(--ed-text)',
            fontSize: 13,
            outline: 'none',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute',
              right: 8,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ed-text-dim)',
              display: 'flex',
              alignItems: 'center',
              padding: 2,
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Categories Horizontal Scrolling Bar */}
      <div className={styles.categoriesBar} role="tablist" aria-label="Element categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat.id}
            className={styles.categoryPill}
            data-testid={`category-pill-${cat.id}`}
            onClick={() => setCategory(cat.id)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{cat.icon} {cat.label}</span>
          </button>
        ))}
      </div>

      {/* Pattern Selector (when in Patterns tab) */}
      {selectedCategory === 'patterns' && (
        <div className={styles.patternSelector}>
          <select
            value={selectedPattern?.id || ''}
            onChange={(e) => setSelectedPattern(getPattern(e.target.value) || null)}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--ed-border)',
              background: 'var(--ed-surface-2)',
              color: 'var(--ed-text)',
              fontSize: 13,
            }}
          >
            <option value="">Select a pattern...</option>
            {PATTERN_DEFINITIONS.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {selectedPattern && (
            <Suspense fallback={<div className={styles.skeleton}>Loading pattern editor...</div>}>
              <PatternEditor
                pattern={selectedPattern}
                options={patternOptions}
                onChange={setPatternOptions}
                onInsert={insertPattern}
              />
            </Suspense>
          )}
        </div>
      )}

      {/* DiceBear Generator (when in Generated tab) */}
      {selectedCategory === 'generated' && (
        <div className={styles.dicebearSelector}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {DICEBEAR_STYLES.map(style => (
              <button
                key={style.id}
                type="button"
                className={`${styles.dicebearStyleBtn} ${dicebearStyle === style.id ? styles.active : ''}`}
                onClick={() => setDicebearStyle(style.id)}
                title={style.label}
              >
                <span style={{ fontSize: 20 }}>{style.preview}</span>
                <span style={{ fontSize: 11, marginLeft: 4 }}>{style.label}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="text"
              value={dicebearSeed}
              onChange={(e) => setDicebearSeed(e.target.value)}
              placeholder="Enter seed (name, word, emoji...)"
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--ed-border)',
                background: 'var(--ed-surface-2)',
                color: 'var(--ed-text)',
                fontSize: 13,
              }}
            />
            <button
              type="button"
              onClick={() => {
                const randomSeed = Math.random().toString(36).substring(2, 10)
                setDicebearSeed(randomSeed)
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--ed-border)',
                background: 'var(--ed-surface-2)',
                color: 'var(--ed-text)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Random
            </button>
          </div>
          <Suspense fallback={<div className={styles.skeleton}>Loading generator...</div>}>
            <DiceBearGenerator
              style={dicebearStyle}
              seed={dicebearSeed}
              onInsert={insertDiceBear}
            />
          </Suspense>
        </div>
      )}

      <div className={styles.scrollArea} ref={gridRef}>
        {isAllView ? (
          /* ================= ALL VIEW (Horizontal Carousels) ================= */
          <>
            {/* 1. Shapes & Lines */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}><Shapes size={16} /> Shapes & Lines</h3>
                <button type="button" className={styles.seeAllBtn} data-testid="see-all-shapes" onClick={() => setCategory('shapes')}>See all</button>
              </div>
              <div className={styles.carousel} data-testid="carousel-shapes">
                {/* Show curated shapes from multiple sets */}
                {['lucide:square','lucide:circle','lucide:triangle','lucide:hexagon','lucide:star','lucide:diamond','lucide:heart','lucide:shield','lucide:sparkles','lucide:arrow-right','lucide:arrow-left','lucide:arrow-up','lucide:arrow-down','tabler:arrow-narrow-right','tabler:cylinder','tabler:oval-vertical','tabler:parallelogram','mdi:polygon','mdi:octagon','mdi:star-four-points']
                  .map(parseIconId).filter((i): i is IconifyIcon => i !== null)
                  .slice(0, 14).map(icon => renderCarouselItem(icon, `item-shape-${icon.id}`, () => void insertIcon(icon)))}
              </div>
            </div>

            {/* 2. Illustrations (unDraw) */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}><Image size={16} /> Illustrations</h3>
                <button type="button" className={styles.seeAllBtn} data-testid="see-all-illustrations" onClick={() => setCategory('illustrations')}>See all</button>
              </div>
              <div className={styles.carousel} data-testid="carousel-illustrations">
                {loadingPreviews && previewIllustrations.length === 0
                  ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className={styles.carouselItem} height={68} />)
                  : previewIllustrations.map(renderUndrawCarouselItem)}
              </div>
            </div>

            {/* 4. Frames & Masks */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}><Box size={16} /> Frames & Masks</h3>
                <button type="button" className={styles.seeAllBtn} data-testid="see-all-frames" onClick={() => setCategory('frames')}>See all</button>
              </div>
              <div className={styles.carousel} data-testid="carousel-frames">
                {NATIVE_FRAMES.slice(0, 10).map(renderFrameCarouselItem)}
              </div>
            </div>

            {/* 5. Patterns */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}><Palette size={16} /> Patterns</h3>
                <button type="button" className={styles.seeAllBtn} data-testid="see-all-patterns" onClick={() => setCategory('patterns')}>See all</button>
              </div>
              <div className={styles.carousel} data-testid="carousel-patterns">
                {PATTERN_DEFINITIONS.slice(0, 10).map(p => (
                  <div key={p.id} className={styles.carouselItem} onClick={() => { setCategory('patterns'); setSelectedPattern(p) }}>
                    <div style={{ width: 68, height: 68, borderRadius: 8, background: 'var(--ed-surface-2)', position: 'relative' }}>
                      <svg width="68" height="68" viewBox="0 0 68 68">
                        <defs dangerouslySetInnerHTML={{ __html: patternDefPreview(p, `thumb-${p.id}`) }} />
                        <rect width="68" height="68" fill={`url(#custom-pattern-thumb-${p.id})`} />
                      </svg>
                    </div>
                    <span style={{ fontSize: 11, display: 'block', textAlign: 'center', marginTop: 4 }}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 6. Generated Stickers */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}><Box size={16} /> AI Stickers</h3>
                <button type="button" className={styles.seeAllBtn} data-testid="see-all-generated" onClick={() => setCategory('generated')}>See all</button>
              </div>
              <div className={styles.carousel} data-testid="carousel-generated">
                {loadingPreviews && previewGenerated.length === 0
                  ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className={styles.carouselItem} height={68} />)
                  : previewGenerated.map((url, i) => (
                      <div key={i} className={styles.carouselItem} onClick={() => void insertDiceBear('fun-emoji', url)}>
                        <img src={`${url}&size=68`} alt="Generated" loading="lazy" style={{ width: 68, height: 68, borderRadius: 8 }} />
                      </div>
                    ))}
              </div>
            </div>
          </>
        ) : (
          /* ================= CATEGORY / SEARCH GRID VIEW ================= */
          <div>
            <div className={styles.backHeader}>
              <button type="button" className={styles.backBtn} onClick={() => { setCategory('all'); setSearchQuery('') }}>
                <ArrowLeft size={16} /> All Elements
              </button>
            </div>

            {/* Shapes Grid */}
            {(selectedCategory === 'shapes' || (selectedCategory === 'all' && debouncedQuery)) && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '8px 0', fontSize: 13, fontWeight: 600 }}>Shapes & Lines</h4>
                {loadingCategory && iconifyResults.length === 0 ? (
                  <div className={styles.grid}>{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className={styles.skel} />)}</div>
                ) : iconifyResults.length === 0 ? (
                  <div className={styles.emptyState}>No shapes found.</div>
                ) : (
                  <>
                    <div className={styles.grid}>
                      {iconifyResults.map(icon => renderGridItem(icon, 64, `grid-shape-${icon.id}`, () => void insertIcon(icon)))}
                    </div>
                    <div ref={sentinelRef} style={{ height: 8 }} />
                    {hasMoreCategory && (
                      <button type="button" onClick={loadMore} disabled={loadingCategory} className={styles.loadMoreBtn}>
                        {loadingCategory ? 'Loading...' : 'Load more'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Illustrations Grid */}
            {(selectedCategory === 'illustrations' || (selectedCategory === 'all' && debouncedQuery)) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Illustrations</h4>
                  <Suspense fallback={null}>
                    <UndrawColorPicker color={undrawPrimaryColor} onChange={setUndrawPrimaryColor} />
                  </Suspense>
                </div>
                {loadingCategory && elementResults.length === 0 ? (
                  <div className={styles.grid}>{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className={styles.skel} />)}</div>
                ) : elementResults.length === 0 ? (
                  <div className={styles.emptyState}>No illustrations found.</div>
                ) : (
                  <>
                    <div className={styles.grid}>
                      {elementResults.map(renderUndrawGridItem)}
                    </div>
                    {hasMoreCategory && (
                      <button type="button" onClick={loadMore} disabled={loadingCategory} className={styles.loadMoreBtn}>
                        {loadingCategory ? 'Loading...' : 'Load more'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Frames Grid */}
            {(selectedCategory === 'frames' || (selectedCategory === 'all' && debouncedQuery)) && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '8px 0', fontSize: 13, fontWeight: 600 }}>Frames & Masks</h4>
                <div className={styles.grid}>
                  {NATIVE_FRAMES.map(renderFrameGridItem)}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className={styles.actionBtn} onClick={() => {
                    void insertFrame(generateRandomBlobFrame())
                  }}>
                    <Sparkles size={14} /> Random Blob
                  </button>
                  <button type="button" className={styles.actionBtn} onClick={() => {
                    // Insert all 5 blobs
                    BLOB_SEEDS.forEach((_, i) => void insertFrame(getBlobFrame(i)))
                  }}>
                    <Layers size={14} /> Insert All Blobs
                  </button>
                </div>
              </div>
            )}

            {/* Patterns Grid */}
            {selectedCategory === 'patterns' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Seamless Patterns</h4>
                  <label style={{ cursor: 'pointer', fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--ed-accent)', color: '#fff', border: 'none' }}>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                      const files = e.target.files
                      if (!files || files.length === 0) return
                      void editor.insert.imageFiles(Array.from(files))
                      e.target.value = ''
                    }} />
                    Upload from device
                  </label>
                </div>
                <div className={styles.grid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                  {PATTERN_DEFINITIONS.map(p => (
                    <div
                      key={p.id}
                      className={styles.gridItem}
                      onClick={() => { setSelectedPattern(p); void insertPattern(p, true) }}
                      data-testid={`pattern-card-${p.id}`}
                      title={`Apply ${p.name}`}
                      style={{ cursor: 'pointer', aspectRatio: '1' }}
                    >
                      <div style={{ width: '100%', height: '100%', borderRadius: 8, background: 'var(--ed-surface-2)', position: 'relative' }}>
                        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <defs dangerouslySetInnerHTML={{ __html: patternDefPreview(p, `grid-${p.id}`) }} />
                          <rect width="100" height="100" fill={`url(#custom-pattern-grid-${p.id})`} />
                        </svg>
                      </div>
                      <span style={{ fontSize: 11, display: 'block', textAlign: 'center', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// HELPER COMPONENTS
// ============================================

// Pattern preview helper for carousel/thumbnails
function patternDefPreview(pattern: PatternDefinition, idSuffix: string | number = '') {
  const opts = pattern.defaultOptions
  const size = 100
  let content = ''

  // Simplified preview generation for thumbnails
  switch (pattern.id) {
    case 'polka-dots': {
      const r = 6, spacing = 20
      for (let y = -spacing; y < size + spacing; y += spacing) {
        for (let x = -spacing; x < size + spacing; x += spacing) {
          const ox = (y / spacing) % 2 === 0 ? 0 : spacing / 2
          content += `<circle cx="${x + ox}" cy="${y}" r="${r}" fill="${opts.primaryColor}"/>`
        }
      }
      break
    }
    case 'chevron': {
      const h = 12, w = 24
      for (let y = -h * 2; y < size + h * 2; y += h) {
        for (let x = -w * 2; x < size + w * 2; x += w) {
          const flip = ((x / w) + (y / h)) % 2 === 0 ? 1 : -1
          content += `<path d="M ${x} ${y} L ${x + w/2} ${y + flip * h} L ${x + w} ${y}" fill="none" stroke="${opts.primaryColor}" strokeWidth="1.5"/>`
        }
      }
      break
    }
    case 'islamic-star': {
      const r = 10, spacing = 35
      for (let gy = -spacing; gy < size + spacing; gy += spacing) {
        for (let gx = -spacing; gx < size + spacing; gx += spacing) {
          const cx = gx + spacing/2, cy = gy + spacing/2
          let star = ''
          for (let i = 0; i < 8; i++) {
            const angle = (i/8)*Math.PI*2 - Math.PI/8
            const rx = r * (i%2===0?1:0.4)
            star += (i===0?`M ${cx+Math.cos(angle)*rx} ${cy+Math.sin(angle)*rx}`:` L ${cx+Math.cos(angle)*rx} ${cy+Math.sin(angle)*rx}`)
          }
          content += `<path d="${star} Z" fill="${opts.primaryColor}"/>`
        }
      }
      break
    }
    case 'honeycomb': {
      const r = 12, h = Math.sqrt(3)*r, w = 1.5*r
      for (let row = -1; row < size/h+2; row++) {
        for (let col = -1; col < size/w+2; col++) {
          const cx = col*w + (row%2===0?0:w/2), cy = row*h
          content += `<polygon points="${Array.from({length:6},(_,i)=>`${cx+Math.cos(i/6*Math.PI*2)*r},${cy+Math.sin(i/6*Math.PI*2)*r}`).join(' ')}" fill="none" stroke="${opts.primaryColor}" strokeWidth="1"/>`
        }
      }
      break
    }
    case 'diagonal-stripes': {
      const sw = 6, gap = 12, period = sw+gap
      for (let i = -size*2; i < size*3; i += period) {
        content += `<rect x="${i}" y="-${size*2}" width="${sw}" height="${size*4}" fill="${opts.primaryColor}"/>`
      }
      break
    }
    case 'grid': {
      const spacing = 15, lw = 1
      for (let i = 0; i <= size; i += spacing) {
        content += `<line x1="${i}" y1="0" x2="${i}" y2="${size}" stroke="${opts.primaryColor}" strokeWidth="${lw}"/>`
        content += `<line x1="0" y1="${i}" x2="${size}" y2="${i}" stroke="${opts.primaryColor}" strokeWidth="${lw}"/>`
      }
      break
    }
    case 'waves': {
      const amp = 6, wl = 30, lines = 4
      for (let l = 0; l < lines; l++) {
        const yo = (size/lines)*l
        let path = `M 0 ${yo}`
        for (let x = 0; x <= size; x += 2) {
          path += ` L ${x} ${yo + Math.sin((x/wl)*Math.PI*2)*amp}`
        }
        content += `<path d="${path}" fill="none" stroke="${opts.primaryColor}" strokeWidth="1" strokeLinecap="round"/>`
      }
      break
    }
    case 'terrazzo':
    case 'confetti':
    case 'maze': {
      const random = mulberry32(pattern.defaultOptions.seed || 12345)
      const pieces = pattern.id === 'maze' ? 0 : 40
      if (pattern.id === 'maze') {
        const cell = 16, wall = 1.5
        for (let row = 0; row < size/cell; row++) {
          for (let col = 0; col < size/cell; col++) {
            const x = col*cell, y = row*cell
            if (random() > 0.5) content += `<line x1="${x}" y1="${y}" x2="${x+cell}" y2="${y}" stroke="${opts.primaryColor}" strokeWidth="${wall}"/>`
            if (random() > 0.5) content += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y+cell}" stroke="${opts.primaryColor}" strokeWidth="${wall}"/>`
          }
        }
      } else {
        for (let i = 0; i < pieces; i++) {
          const x = random()*size, y = random()*size
          const w = 2+random()*8, h = 2+random()*8
          const colors = [opts.primaryColor, '#fff', '#f0f0f0', '#e0e0e0']
          const color = colors[Math.floor(random()*colors.length)]
          content += `<rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" fill="${color}" transform="rotate(${random()*360} ${x} ${y})"/>`
        }
      }
      break
    }
    case 'dots-grid': {
      const spacing = 15, r = 2.5
      for (let y = 0; y <= size; y += spacing) for (let x = 0; x <= size; x += spacing) content += `<circle cx="${x}" cy="${y}" r="${r}" fill="${opts.primaryColor}"/>`
      break
    }
    case 'concentric-circles': {
      const spacing = 10
      for (let r = spacing; r < size; r += spacing) content += `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${opts.primaryColor}" strokeWidth="0.8"/>`
      break
    }
    case 'hexagon-grid': {
      const r = 10, h = Math.sqrt(3)*r, w = 1.5*r
      for (let row = -1; row < size/h+2; row++) {
        for (let col = -1; col < size/w+2; col++) {
          const cx = col*w + (row%2===0?0:w/2), cy = row*h
          content += `<polygon points="${Array.from({length:6},(_,i)=>`${cx+Math.cos(i/6*Math.PI*2+Math.PI/6)*r},${cy+Math.sin(i/6*Math.PI*2+Math.PI/6)*r}`).join(' ')}" fill="none" stroke="${opts.primaryColor}" strokeWidth="0.8"/>`
        }
      }
      break
    }
    default: {
      // Generic fallback
      for (let y = 0; y <= size; y += 20) for (let x = 0; x <= size; x += 20) content += `<circle cx="${x}" cy="${y}" r="3" fill="${opts.primaryColor}"/>`
    }
  }

  return `<pattern id="custom-pattern-${idSuffix}" patternUnits="userSpaceOnUse" width="${size}" height="${size}">
${opts.backgroundColor !== 'transparent' ? `<rect width="100%" height="100%" fill="${opts.backgroundColor}"/>` : ''}
<g opacity="${opts.opacity}">${content}</g>
</pattern>`
}

// Mulberry32 for pattern previews
function mulberry32(a: number): () => number {
  return function() {
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

import { getPattern } from './FramesAndShapesCatalog'
