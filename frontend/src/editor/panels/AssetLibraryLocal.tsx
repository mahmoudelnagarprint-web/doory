import { useMemo, useState } from 'react'
import type { LocalAsset } from '@/types/api'
import { useEditor } from '../context'
import { useLocalAssets } from '../hooks/useLocalAssets'
import { t } from '../strings'
import { Skeleton } from '../ui/Skeleton'
import ed from '../chrome/ed.module.css'
import { setAssetDrag } from '../drawers/assetDrag'
import { LibrarySearch } from './library'
import styles from './AssetLibrary.module.css'

/** SVG and PNG files an admin put in `LOCAL_ASSETS_DIR` (the "premium stickers" folder). */
export function AssetLibraryLocal() {
  const editor = useEditor()
  const { assets, enabled, detail, loading, failed, truncated, reload } = useLocalAssets()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const visible = useMemo<LocalAsset[]>(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return assets
    return assets.filter((asset) => asset.name.toLowerCase().includes(needle) || asset.path.toLowerCase().includes(needle))
  }, [assets, query])

  const add = async (asset: LocalAsset): Promise<void> => {
    setBusy(asset.path)
    try {
      if (asset.type === 'svg') {
        const res = await fetch(asset.url, { credentials: 'same-origin' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        if (!text.trimStart().startsWith('<svg')) throw new Error('Not an SVG')
        await editor.insert.svgElement(text, `local:${asset.path}`, asset.name)
      } else {
        await editor.insert.imageFromAsset({ id: `local:${asset.path}`, url: asset.url, thumbUrl: asset.url, width: 0, height: 0, name: asset.name, kind: 'image' })
      }
    } catch {
      editor.toast(t.assetLibrary.insertFailed, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.body}>
      {enabled || loading ? (
        <LibrarySearch value={query} onChange={setQuery} placeholder={t.assetLibrary.localSearch} clearLabel={t.assetLibrary.clearSearch} testId="local-assets-search" />
      ) : null}
      <div className={styles.scroll}>
        {loading ? (
          <div className={`${styles.grid} ${styles.localGrid}`} aria-busy="true" aria-label={t.assetLibrary.loading}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className={styles.skeleton} height="auto" />
            ))}
          </div>
        ) : null}
        {!loading && failed ? (
          <div className={styles.state} role="alert">
            <span>{t.assetLibrary.localFailed}</span>
            <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={reload}>
              {t.assetLibrary.retry}
            </button>
          </div>
        ) : null}
        {!loading && !failed && !enabled ? (
          <div className={styles.state} data-testid="local-assets-off">
            <span>{t.assetLibrary.localEmpty}</span>
            {detail ? <small>{detail}</small> : null}
          </div>
        ) : null}
        {!loading && !failed && enabled && visible.length === 0 ? <p className={styles.note}>{query ? t.assetLibrary.localNoMatch(query) : t.assetLibrary.localEmpty}</p> : null}
        {visible.length > 0 ? (
          <div className={`${styles.grid} ${styles.localGrid}`} data-testid="local-assets-grid">
            {visible.map((asset) => (
              <button
                key={asset.path}
                type="button"
                className={`${styles.cell} ${styles.localCell}`}
                title={asset.path}
                aria-label={t.assetLibrary.localAdd(asset.name)}
                aria-busy={busy === asset.path || undefined}
                data-testid="local-asset"
                draggable
                onDragStart={(e) => setAssetDrag(e.dataTransfer, { kind: 'local', url: asset.url, name: asset.name, type: asset.type })}
                onClick={() => void add(asset)}
              >
                <img src={asset.url} alt="" loading="lazy" draggable={false} />
                <span className={styles.localName}>{asset.name}</span>
              </button>
            ))}
          </div>
        ) : null}
        {visible.length > 0 ? (
          <p className={styles.meta}>
            {t.assetLibrary.localCount(visible.length)}
            {truncated ? ` · ${t.assetLibrary.localTruncated}` : ''}
          </p>
        ) : null}
        {enabled && !loading && visible.length > 0 ? <p className={styles.credit}>{t.assetLibrary.localHint}</p> : null}
      </div>
    </div>
  )
}
