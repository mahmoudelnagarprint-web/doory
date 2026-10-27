import { useEffect, useRef, useState } from 'react'
import { fetchIconSvg, ICONIFY_PAGE_SIZE, iconPreviewUrl, searchIcons } from '@/lib/api'
import type { IconifyIcon } from '@/types/api'
import { useEditor } from '../context'
import { useAsyncList } from '../hooks/useAsyncList'
import { useDebounced } from '../hooks/useDebounced'
import { t } from '../strings'
import { Skeleton } from '../ui/Skeleton'
import ed from '../chrome/ed.module.css'
import { LibrarySearch } from './library'
import styles from './AssetLibrary.module.css'

/**
 * Iconify's catalogue as canvas vectors: search returns icon ids, the previews are the API's small SVGs,
 * and a click fetches the same icon at 512 px and inserts it as an editable vector group.
 */
export function AssetLibraryIcons() {
  const editor = useEditor()
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim(), 350)
  const [busy, setBusy] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  const list = useAsyncList<IconifyIcon>(
    async (page) => {
      controller.current?.abort()
      const next = new AbortController()
      controller.current = next
      const start = (page - 1) * ICONIFY_PAGE_SIZE
      const res = await searchIcons(q, { start, limit: ICONIFY_PAGE_SIZE, signal: next.signal })
      return { count: res.total, next: res.nextStart === null ? null : String(res.nextStart), previous: null, results: res.icons }
    },
    q,
    q.length >= 2,
  )

  useEffect(() => () => controller.current?.abort(), [])

  const add = async (icon: IconifyIcon): Promise<void> => {
    setBusy(icon.id)
    try {
      const svg = await fetchIconSvg(icon)
      await editor.insert.svgElement(svg, `iconify:${icon.id}`, icon.label)
    } catch {
      editor.toast(t.assetLibrary.insertFailed, 'error')
    } finally {
      setBusy(null)
    }
  }

  const searched = q.length >= 2
  return (
    <div className={styles.body}>
      <LibrarySearch value={query} onChange={setQuery} placeholder={t.assetLibrary.iconSearch} clearLabel={t.assetLibrary.clearSearch} testId="iconify-search" />
      <div className={styles.scroll}>
        {!searched ? <p className={styles.note}>{t.assetLibrary.iconHint}</p> : null}
        {searched && list.loading && list.items.length === 0 ? (
          <div className={styles.grid} aria-busy="true" aria-label={t.assetLibrary.iconLoading}>
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className={styles.skeleton} height="auto" />
            ))}
          </div>
        ) : null}
        {searched && list.error && list.items.length === 0 ? (
          <div className={styles.state} role="alert">
            <span>{t.assetLibrary.iconFailed}</span>
            <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={list.reload}>
              {t.assetLibrary.retry}
            </button>
          </div>
        ) : null}
        {searched && !list.loading && !list.error && list.items.length === 0 ? <p className={styles.note}>{t.assetLibrary.iconEmpty(q)}</p> : null}
        {searched && list.items.length > 0 ? (
          <div className={styles.grid} data-testid="iconify-grid">
            {list.items.map((icon) => (
              <button
                key={icon.id}
                type="button"
                className={styles.cell}
                title={icon.id}
                aria-label={t.assetLibrary.iconAdd(icon.label)}
                aria-busy={busy === icon.id || undefined}
                data-testid="iconify-cell"
                onClick={() => void add(icon)}
              >
                <img src={iconPreviewUrl(icon.id)} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        ) : null}
        {searched && list.hasMore && list.items.length > 0 ? (
          <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={list.loadMore} disabled={list.loading}>
            {t.assetLibrary.loadMore}
          </button>
        ) : null}
        {searched && list.items.length > 0 ? <p className={styles.credit}>{t.assetLibrary.iconCredited}</p> : null}
      </div>
    </div>
  )
}
