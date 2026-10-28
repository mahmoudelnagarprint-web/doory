/**
 * Stickers — the dedicated tab in the tool rail (between Shapes and Elements).
 *
 * Everything sticker lives here: the quick one-click cut-out, the AI Sticker Studio, the custom
 * vault ("مكتبتي الخاصة"), the curated emoji sets and search. The heavy studio opens through the
 * `sticker-studio` dialog, so nothing here touches the editor's initial bundle.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { LibraryBig, Search, Wand2, X } from 'lucide-react'
import {
  fetchIconSvg,
  iconPreviewUrl,
} from '@/lib/api/iconify'
import { searchStickers, MAX_SEARCH_LIMIT, type CategorizedIcon } from '@/lib/api/megaAssets'
import { getCuratedCategoryPage } from '@/lib/api/megaAssets'
import { useEditor } from '../../context'
import { useDebounced } from '../../hooks/useDebounced'
import { setAssetDrag } from '../../drawers/assetDrag'
import { Skeleton } from '../../ui/Skeleton'
import { StickersVaultPreview } from './StickersVaultPreview'
import styles from './ElementsPanel.module.css'

const STICKER_PAGE_SIZE = 60

/** Strips an extension and tidies the name used for the vault record and the canvas object. */
function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || 'Sticker'
}

export function StickersPanel() {
  const editor = useEditor()
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedQuery = useDebounced(searchQuery.trim(), 300)

  const [subCategory, setSubCategory] = useState('all')
  const [curatedCategories, setCuratedCategories] = useState<Array<{ id: string; label: string }>>([])
  const [results, setResults] = useState<CategorizedIcon[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const [quickBusy, setQuickBusy] = useState(false)
  const quickInputRef = useRef<HTMLInputElement | null>(null)

  const gridRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Curated sub-category pills: the large literal lives in a lazy chunk.
  useEffect(() => {
    let active = true
    void import('@/lib/api/stickerCatalog')
      .then((m) => { if (active) setCuratedCategories(m.CURATED_STICKER_CATEGORIES) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  // Load the first page whenever the category or the search changes.
  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the loading flag before the async load starts
    setLoading(true)
    const load = async (): Promise<void> => {
      try {
        if (!debouncedQuery) {
          const res = await getCuratedCategoryPage(subCategory, 0, STICKER_PAGE_SIZE)
          if (!active) return
          setResults(res.items)
          setHasMore(res.nextStart !== null)
        } else {
          const res = await searchStickers(debouncedQuery, { start: 0, limit: MAX_SEARCH_LIMIT })
          if (!active) return
          setResults(res.icons)
          setHasMore(res.nextStart !== null)
        }
      } catch {
        if (active) setResults([])
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [subCategory, debouncedQuery])

  const loadMore = useCallback(async (): Promise<void> => {
    const nextStart = results.length
    if (loading || !hasMore || nextStart === 0) return
    setLoading(true)
    try {
      if (!debouncedQuery) {
        const res = await getCuratedCategoryPage(subCategory, nextStart, STICKER_PAGE_SIZE)
        setResults((prev) => [...prev, ...res.items])
        setHasMore(res.nextStart !== null)
      } else {
        const res = await searchStickers(debouncedQuery, { start: nextStart, limit: MAX_SEARCH_LIMIT })
        setResults((prev) => [...prev, ...res.icons])
        setHasMore(res.nextStart !== null)
      }
    } finally {
      setLoading(false)
    }
  }, [results.length, loading, hasMore, debouncedQuery, subCategory])

  const loadMoreRef = useRef(loadMore)
  useEffect(() => { loadMoreRef.current = loadMore }, [loadMore])

  // Infinite scroll: observe the sentinel under the grid.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !sentinelRef.current || loading || !hasMore) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && hasMore) loadMoreRef.current()
    }, { rootMargin: '200px' })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loading, hasMore, loadMoreRef])

  const insertIcon = useCallback(async (icon: CategorizedIcon): Promise<void> => {
    try {
      const svg = await fetchIconSvg(icon)
      await editor.insert.svgElement(svg, `iconify:${icon.id}`, icon.label)
    } catch {
      editor.toast('Could not insert sticker', 'error')
    }
  }, [editor])

  /**
   * The one-click path for people in a hurry: pick a picture, the auto mode cuts it out with the
   * default settings, the result lands on the canvas and in the vault in one go.
   */
  const quickSticker = useCallback(async (file: File): Promise<void> => {
    setQuickBusy(true)
    try {
      const { createStickerCutout } = await import('@/lib/ai/stickerCutout')
      const { addSticker } = await import('@/lib/storage/stickerVault')
      const result = await createStickerCutout(file, { mode: 'auto' })
      const name = baseName(file.name)
      await editor.insert.imageFiles([new File([await (await fetch(result.dataUrl)).blob()], `${name}-sticker.png`, { type: 'image/png' })])
      try {
        await addSticker({ name, category: 'عام', tags: [], dataUrl: result.dataUrl, width: result.width, height: result.height })
      } catch {
        // The vault is a convenience here: the sticker is already on the canvas.
      }
      editor.toast('تم إنشاء الستيكر وإضافته للتصميم ✅', 'success')
    } catch {
      editor.toast('Could not cut the sticker out', 'error')
    } finally {
      setQuickBusy(false)
    }
  }, [editor])

  return (
    <div className={styles.panel} data-testid="stickers-panel">
      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={styles.actionBtn}
          data-testid="quick-sticker-button"
          disabled={quickBusy}
          title="اختر صورة ويتم قصّها وإضافتها فوراً"
          onClick={() => quickInputRef.current?.click()}
          style={{ flex: '1 1 auto', justifyContent: 'center' }}
        >
          <Wand2 size={13} /> {quickBusy ? 'جارٍ القص…' : 'ستيكر سريع ⚡'}
        </button>
        <button type="button" className={styles.actionBtn} data-testid="open-sticker-studio" onClick={() => editor.openDialog('sticker-studio', { start: 'create' })}>
          الاستوديو
        </button>
        <button type="button" className={styles.actionBtn} data-testid="open-sticker-vault" onClick={() => editor.openDialog('sticker-studio', { start: 'vault' })}>
          <LibraryBig size={13} /> المكتبة
        </button>
      </div>
      <input
        ref={quickInputRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="quick-sticker-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void quickSticker(file)
        }}
      />

      {/* Search Bar */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--ed-text-dim)', pointerEvents: 'none' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search stickers..."
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
            style={{ position: 'absolute', right: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ed-text-dim)', display: 'flex', alignItems: 'center', padding: 2 }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* My Stickers (custom vault) */}
      <StickersVaultPreview />

      {/* Curated sub-categories */}
      {!debouncedQuery && (
        <div className={styles.subCategoriesBar} role="tablist" aria-label="Sticker categories">
          {curatedCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={subCategory === cat.id}
              className={styles.subCategoryPill}
              data-testid={`sticker-subcat-${cat.id}`}
              onClick={() => setSubCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Stickers grid */}
      <div className={styles.scrollArea} ref={gridRef}>
        <div style={{ marginBottom: 16 }}>
          {loading && results.length === 0 ? (
            <div className={styles.grid}>{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className={styles.skel} />)}</div>
          ) : results.length === 0 ? (
            <div className={styles.emptyState}>No stickers found.</div>
          ) : (
            <>
              <div className={styles.grid}>
                {results.map((icon) => (
                  <div
                    key={icon.id}
                    className={styles.gridItem}
                    draggable
                    title={icon.label}
                    data-testid={`grid-sticker-${icon.id}`}
                    onDragStart={(e) => setAssetDrag(e.dataTransfer, { kind: 'iconify', id: icon.id, name: icon.label })}
                    onClick={() => void insertIcon(icon)}
                  >
                    <img src={iconPreviewUrl(icon.id, 64)} alt={icon.label} loading="lazy" />
                  </div>
                ))}
                <div ref={sentinelRef} style={{ height: 20, gridColumn: '1 / -1' }} />
              </div>
              {hasMore && (
                <button type="button" onClick={() => void loadMore()} disabled={loading} className={styles.loadMoreBtn}>
                  {loading ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
