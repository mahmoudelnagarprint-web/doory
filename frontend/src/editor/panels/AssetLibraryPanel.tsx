import { useState } from 'react'
import { useEditor } from '../context'
import { t } from '../strings'
import { loadable } from '../ui/loadable'
import { ElementsPanel } from './elements/ElementsPanel'
import { AssetLibraryLocal } from './AssetLibraryLocal'
import type { PanelProps } from './registry'
import styles from './AssetLibrary.module.css'

const StockTab = loadable(() => import('../drawers/StockTab').then((m) => m.StockTab))

type Tab = 'photos' | 'icons' | 'mine'

/** Panels stay open while things are added from them (the host does the same for drawer tools). */
const keepOpen = (): void => undefined

/**
 * One library for everything that goes on a page: free stock photos, Elements (Shapes, Graphics, Stickers, Frames),
 * and the premium stickers the deployment keeps on disk.
 */
export function AssetLibraryPanel(_props: PanelProps) {
  const editor = useEditor()
  const [tab, setTab] = useState<Tab>('photos')
  const hasStock = editor.adapter.services.stock !== null
  const tabs: { id: Tab; label: string }[] = [
    { id: 'photos', label: t.assetLibrary.photos },
    { id: 'icons', label: 'Elements' },
    { id: 'mine', label: t.assetLibrary.mine },
  ]
  const active = tabs.find((entry) => entry.id === tab) ?? tabs[0]

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label={t.assetLibrary.sections}>
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === entry.id}
            data-testid={`assets-tab-${entry.id}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className={styles.body} role="tabpanel" aria-label={active.label} data-testid={`assets-panel-${tab}`}>
        {tab === 'photos' ? (
          hasStock ? (
            <div className={styles.body}>
              <StockTab close={keepOpen} drag />
            </div>
          ) : (
            <p className={styles.note}>{t.assetLibrary.photosOff}</p>
          )
        ) : null}
        {tab === 'icons' ? <ElementsPanel /> : null}
        {tab === 'mine' ? <AssetLibraryLocal /> : null}
      </div>
    </div>
  )
}
