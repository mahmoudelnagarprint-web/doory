import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import { fetchIconSvg, ICONIFY_PAGE_SIZE, iconPreviewUrl, parseIconId, searchIcons } from '@/lib/api'
import type { IconifyIcon } from '@/types/api'
import type { MaskShapeId } from '@/types/document'
import type { AssetRef } from '@/types/adapter'
import { searchPixabayGraphics, type PixabayGraphicItem } from '@/lib/api/pixabay'
import { useEditor } from '../../context'
import { setAssetDrag } from '../../drawers/assetDrag'
import { useDebounced } from '../../hooks/useDebounced'
import { Skeleton } from '../../ui/Skeleton'
import { FrameArtwork, NATIVE_FRAMES } from './FrameThumb'
import styles from './ElementsPanel.module.css'

export type ElementCategory = 'all' | 'shapes' | 'graphics' | 'stickers' | 'frames'

const CATEGORIES: Array<{ id: ElementCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'shapes', label: 'Shapes & Lines' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'stickers', label: 'Stickers' },
  { id: 'frames', label: 'Frames' },
]

// Default curated Iconify geometric shapes and arrows
const DEFAULT_SHAPES_ICONS: IconifyIcon[] = [
  'lucide:square',
  'lucide:circle',
  'lucide:triangle',
  'lucide:hexagon',
  'lucide:star',
  'lucide:diamond',
  'lucide:pentagon',
  'lucide:heart',
  'lucide:shield',
  'lucide:sparkles',
  'lucide:arrow-right',
  'lucide:arrow-left',
  'lucide:arrow-up',
  'lucide:arrow-down',
  'lucide:arrow-up-right',
  'lucide:arrow-down-right',
  'lucide:move-right',
  'lucide:corner-down-right',
  'tabler:arrow-narrow-right',
  'tabler:cylinder',
  'tabler:oval-vertical',
  'tabler:parallelogram',
]
  .map(parseIconId)
  .filter((i): i is IconifyIcon => i !== null)

export function ElementsPanel() {
  const editor = useEditor()
  const [selectedCategory, setCategory] = useState<ElementCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedQuery = useDebounced(searchQuery.trim(), 300)

  // Carousel data for "All" view
  const [previewGraphics, setPreviewGraphics] = useState<PixabayGraphicItem[]>([])
  const [previewStickers, setPreviewStickers] = useState<PixabayGraphicItem[]>([])
  const [loadingPreviews, setLoadingPreviews] = useState(false)

  // Dedicated category list states
  const [iconifyResults, setIconifyResults] = useState<IconifyIcon[]>([])
  const [pixabayResults, setPixabayResults] = useState<PixabayGraphicItem[]>([])
  const [loadingCategory, setLoadingCategory] = useState(false)
  const [categoryPage, setCategoryPage] = useState(1)
  const [hasMoreCategory, setHasMoreCategory] = useState(false)

  // Load preview carousels for "All" view on mount
  useEffect(() => {
    let active = true
    setLoadingPreviews(true)
    Promise.all([
      searchPixabayGraphics('graphic abstract vector', { category: 'graphics', perPage: 12 }),
      searchPixabayGraphics('sticker cute illustration', { category: 'stickers', perPage: 12 }),
    ])
      .then(([gRes, sRes]) => {
        if (!active) return
        setPreviewGraphics(gRes.items)
        setPreviewStickers(sRes.items)
      })
      .catch(() => {
        // Fallback or ignore preview load failure
      })
      .finally(() => {
        if (active) setLoadingPreviews(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Handle category or search change
  useEffect(() => {
    if (selectedCategory === 'all' && !debouncedQuery) return

    let active = true
    setLoadingCategory(true)
    setCategoryPage(1)

    const cat = selectedCategory === 'all' ? 'graphics' : selectedCategory

    if (cat === 'shapes') {
      const q = debouncedQuery || 'shape arrow'
      searchIcons(q, { start: 0, limit: 36 })
        .then((res) => {
          if (!active) return
          setIconifyResults(debouncedQuery ? res.icons : DEFAULT_SHAPES_ICONS)
          setHasMoreCategory(res.nextStart !== null)
        })
        .catch(() => {
          if (!active) return
          setIconifyResults(DEFAULT_SHAPES_ICONS)
        })
        .finally(() => {
          if (active) setLoadingCategory(false)
        })
    } else if (cat === 'graphics' || cat === 'stickers') {
      const q = debouncedQuery || (cat === 'stickers' ? 'sticker cute' : 'graphic abstract')
      searchPixabayGraphics(q, { category: cat, page: 1, perPage: 24 })
        .then((res) => {
          if (!active) return
          setPixabayResults(res.items)
          setHasMoreCategory(res.hasMore)
        })
        .catch(() => {
          if (!active) return
          setPixabayResults([])
        })
        .finally(() => {
          if (active) setLoadingCategory(false)
        })
    } else {
      setLoadingCategory(false)
    }

    return () => {
      active = false
    }
  }, [selectedCategory, debouncedQuery])

  // Load more for category
  const loadMore = async () => {
    if (loadingCategory || !hasMoreCategory) return
    const nextPage = categoryPage + 1
    const cat = selectedCategory === 'all' ? 'graphics' : selectedCategory

    if (cat === 'shapes') {
      setLoadingCategory(true)
      const q = debouncedQuery || 'shape arrow'
      try {
        const res = await searchIcons(q, { start: iconifyResults.length, limit: ICONIFY_PAGE_SIZE })
        setIconifyResults((prev) => [...prev, ...res.icons])
        setHasMoreCategory(res.nextStart !== null)
        setCategoryPage(nextPage)
      } finally {
        setLoadingCategory(false)
      }
    } else if (cat === 'graphics' || cat === 'stickers') {
      setLoadingCategory(true)
      const q = debouncedQuery || (cat === 'stickers' ? 'sticker cute' : 'graphic abstract')
      try {
        const res = await searchPixabayGraphics(q, { category: cat, page: nextPage, perPage: 24 })
        setPixabayResults((prev) => [...prev, ...res.items])
        setHasMoreCategory(res.hasMore)
        setCategoryPage(nextPage)
      } finally {
        setLoadingCategory(false)
      }
    }
  }

  // Insertion handlers
  const insertIcon = async (icon: IconifyIcon) => {
    try {
      const svg = await fetchIconSvg(icon)
      await editor.insert.svgElement(svg, `iconify:${icon.id}`, icon.label)
    } catch {
      editor.toast('Could not insert icon', 'error')
    }
  }

  const insertPixabay = async (item: PixabayGraphicItem) => {
    try {
      const stock = editor.adapter.services.stock
      if (stock) {
        try {
          const ref = await stock.importPhoto({ provider: 'pixabay', id: item.id })
          await editor.insert.imageFromAsset(ref)
          return
        } catch {
          // fallback to direct asset
        }
      }
      const ref: AssetRef = {
        id: `pixabay:${item.id}`,
        url: item.url,
        thumbUrl: item.previewUrl,
        width: item.width,
        height: item.height,
        name: item.title,
        kind: 'image',
      }
      await editor.insert.imageFromAsset(ref)
    } catch {
      editor.toast('Could not insert graphic', 'error')
    }
  }

  const insertFrame = async (maskId: MaskShapeId) => {
    try {
      await editor.insert.placeholder(maskId)
    } catch {
      editor.toast('Could not insert frame', 'error')
    }
  }

  // Filtered frames when searching
  const filteredFrames = useMemo(() => {
    if (!debouncedQuery) return NATIVE_FRAMES
    const q = debouncedQuery.toLowerCase()
    return NATIVE_FRAMES.filter((f) => f.name.toLowerCase().includes(q) || f.id.includes(q))
  }, [debouncedQuery])

  const isAllView = selectedCategory === 'all' && !debouncedQuery

  return (
    <div className={styles.panel} data-testid="elements-panel">
      {/* Search Bar */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search
          size={16}
          style={{ position: 'absolute', left: 10, color: 'var(--ed-text-dim)', pointerEvents: 'none' }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search elements..."
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
        {searchQuery ? (
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
        ) : null}
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
            onClick={() => {
              setCategory(cat.id)
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className={styles.scrollArea}>
        {isAllView ? (
          /* ================= ALL VIEW (Horizontal Carousels) ================= */
          <>
            {/* 1. Shapes & Lines */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Shapes & Lines</h3>
                <button
                  type="button"
                  className={styles.seeAllBtn}
                  data-testid="see-all-shapes"
                  onClick={() => setCategory('shapes')}
                >
                  See all
                </button>
              </div>
              <div className={styles.carousel} data-testid="carousel-shapes">
                {DEFAULT_SHAPES_ICONS.slice(0, 10).map((icon) => (
                  <div
                    key={icon.id}
                    className={styles.carouselItem}
                    draggable
                    title={icon.label}
                    data-testid={`item-shape-${icon.id}`}
                    onDragStart={(e) => {
                      setAssetDrag(e.dataTransfer, { kind: 'iconify', id: icon.id, name: icon.label })
                    }}
                    onClick={() => void insertIcon(icon)}
                  >
                    <img src={iconPreviewUrl(icon.id, 48)} alt={icon.label} loading="lazy" />
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Graphics (Pixabay transparent vectors) */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Graphics</h3>
                <button
                  type="button"
                  className={styles.seeAllBtn}
                  data-testid="see-all-graphics"
                  onClick={() => setCategory('graphics')}
                >
                  See all
                </button>
              </div>
              <div className={styles.carousel} data-testid="carousel-graphics">
                {loadingPreviews && previewGraphics.length === 0
                  ? Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className={styles.carouselItem} height={68} />
                    ))
                  : previewGraphics.map((item) => (
                      <div
                        key={item.id}
                        className={styles.carouselItem}
                        draggable
                        title={item.title}
                        data-testid={`item-graphic-${item.id}`}
                        onDragStart={(e) => {
                          setAssetDrag(e.dataTransfer, {
                            kind: 'pixabay',
                            id: item.id,
                            name: item.title,
                            url: item.url,
                            previewUrl: item.previewUrl,
                          })
                        }}
                        onClick={() => void insertPixabay(item)}
                      >
                        <img src={item.previewUrl} alt={item.title} loading="lazy" />
                      </div>
                    ))}
              </div>
            </div>

            {/* 3. Stickers (Pixabay stickers & illustrations) */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Stickers</h3>
                <button
                  type="button"
                  className={styles.seeAllBtn}
                  data-testid="see-all-stickers"
                  onClick={() => setCategory('stickers')}
                >
                  See all
                </button>
              </div>
              <div className={styles.carousel} data-testid="carousel-stickers">
                {loadingPreviews && previewStickers.length === 0
                  ? Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className={styles.carouselItem} height={68} />
                    ))
                  : previewStickers.map((item) => (
                      <div
                        key={item.id}
                        className={styles.carouselItem}
                        draggable
                        title={item.title}
                        data-testid={`item-sticker-${item.id}`}
                        onDragStart={(e) => {
                          setAssetDrag(e.dataTransfer, {
                            kind: 'pixabay',
                            id: item.id,
                            name: item.title,
                            url: item.url,
                            previewUrl: item.previewUrl,
                          })
                        }}
                        onClick={() => void insertPixabay(item)}
                      >
                        <img src={item.previewUrl} alt={item.title} loading="lazy" />
                      </div>
                    ))}
              </div>
            </div>

            {/* 4. Frames (Clipping Masks) */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Frames (Photo Placeholders)</h3>
                <button
                  type="button"
                  className={styles.seeAllBtn}
                  data-testid="see-all-frames"
                  onClick={() => setCategory('frames')}
                >
                  See all
                </button>
              </div>
              <div className={styles.carousel} data-testid="carousel-frames">
                {NATIVE_FRAMES.map((frame) => (
                  <div
                    key={frame.id}
                    className={styles.carouselItem}
                    draggable
                    title={frame.name}
                    data-testid={`item-frame-${frame.id}`}
                    onDragStart={(e) => {
                      setAssetDrag(e.dataTransfer, {
                        kind: 'frame',
                        mask: frame.id,
                        name: frame.name,
                      })
                    }}
                    onClick={() => void insertFrame(frame.id)}
                  >
                    <FrameArtwork path={frame.path} id={`carousel-${frame.id}`} />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* ================= CATEGORY / SEARCH GRID VIEW ================= */
          <div>
            <div className={styles.backHeader}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => {
                  setCategory('all')
                  setSearchQuery('')
                }}
              >
                <ArrowLeft size={16} /> All Elements
              </button>
            </div>

            {/* Shapes Grid */}
            {(selectedCategory === 'shapes' || (selectedCategory === 'all' && debouncedQuery)) && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '8px 0', fontSize: 13, fontWeight: 600 }}>Shapes & Lines</h4>
                <div className={styles.grid}>
                  {iconifyResults.map((icon) => (
                    <div
                      key={icon.id}
                      className={styles.gridItem}
                      draggable
                      title={icon.label}
                      data-testid={`grid-shape-${icon.id}`}
                      onDragStart={(e) => {
                        setAssetDrag(e.dataTransfer, { kind: 'iconify', id: icon.id, name: icon.label })
                      }}
                      onClick={() => void insertIcon(icon)}
                    >
                      <img src={iconPreviewUrl(icon.id, 64)} alt={icon.label} loading="lazy" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Graphics & Stickers Grid */}
            {(selectedCategory === 'graphics' || selectedCategory === 'stickers' || (selectedCategory === 'all' && debouncedQuery)) && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '8px 0', fontSize: 13, fontWeight: 600 }}>
                  {selectedCategory === 'stickers' ? 'Stickers' : 'Graphics'}
                </h4>
                {loadingCategory && pixabayResults.length === 0 ? (
                  <div className={styles.grid}>
                    {Array.from({ length: 9 }, (_, i) => (
                      <Skeleton key={i} className={styles.skel} />
                    ))}
                  </div>
                ) : pixabayResults.length === 0 ? (
                  <div className={styles.emptyState}>No transparent graphics found.</div>
                ) : (
                  <div className={styles.grid}>
                    {pixabayResults.map((item) => (
                      <div
                        key={item.id}
                        className={styles.gridItem}
                        draggable
                        title={item.title}
                        data-testid={`grid-pixabay-${item.id}`}
                        onDragStart={(e) => {
                          setAssetDrag(e.dataTransfer, {
                            kind: 'pixabay',
                            id: item.id,
                            name: item.title,
                            url: item.url,
                            previewUrl: item.previewUrl,
                          })
                        }}
                        onClick={() => void insertPixabay(item)}
                      >
                        <img src={item.previewUrl} alt={item.title} loading="lazy" />
                      </div>
                    ))}
                  </div>
                )}
                {hasMoreCategory && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingCategory}
                    style={{
                      marginTop: 12,
                      width: '100%',
                      padding: '8px 12px',
                      background: 'var(--ed-surface-2)',
                      border: '1px solid var(--ed-border)',
                      borderRadius: 6,
                      color: 'var(--ed-text)',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {loadingCategory ? 'Loading...' : 'Load more'}
                  </button>
                )}
                <p className={styles.credit}>Graphics provided by Pixabay</p>
              </div>
            )}

            {/* Frames Grid */}
            {(selectedCategory === 'frames' || (selectedCategory === 'all' && debouncedQuery)) && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '8px 0', fontSize: 13, fontWeight: 600 }}>Frames (Photo Placeholders)</h4>
                <div className={styles.grid}>
                  {filteredFrames.map((frame) => (
                    <div
                      key={frame.id}
                      className={styles.gridItem}
                      draggable
                      title={frame.name}
                      data-testid={`grid-frame-${frame.id}`}
                      onDragStart={(e) => {
                        setAssetDrag(e.dataTransfer, {
                          kind: 'frame',
                          mask: frame.id,
                          name: frame.name,
                        })
                      }}
                      onClick={() => void insertFrame(frame.id)}
                    >
                      <FrameArtwork path={frame.path} id={`grid-${frame.id}`} />
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
