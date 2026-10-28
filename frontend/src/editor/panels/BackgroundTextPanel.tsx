import { useState, Suspense, lazy } from 'react'
import { Palette, ALargeSmall, Sparkles, Blend } from 'lucide-react'
import styles from './BackgroundTextPanel.module.css'

// Lazy-load all Sub-phase B components
const GradientPicker = lazy(() => import('./elements/GradientPicker').then(m => ({ default: m.GradientPicker })))
const ColorKitSelector = lazy(() => import('./elements/ColorKitSelector').then(m => ({ default: m.ColorKitSelector })))
const FontLoaderPanel = lazy(() => import('./elements/FontLoaderPanel').then(m => ({ default: m.FontLoaderPanel })))
const TextEffectsPanel = lazy(() => import('./elements/TextEffectsPanel').then(m => ({ default: m.TextEffectsPanel })))

export type BackgroundTab = 'gradients' | 'color-kits' | 'fonts' | 'text-effects'

const TABS: Array<{ id: BackgroundTab; label: string; icon: React.ReactNode }> = [
  { id: 'gradients', label: 'Gradients', icon: <Blend size={16} /> },
  { id: 'color-kits', label: 'Color Kits', icon: <Palette size={16} /> },
  { id: 'fonts', label: 'Fonts', icon: <ALargeSmall size={16} /> },
  { id: 'text-effects', label: 'Text Effects', icon: <Sparkles size={16} /> },
]

export function BackgroundTextPanel() {
  const [activeTab, setActiveTab] = useState<BackgroundTab>('gradients')
  
  return (
    <div className={styles.panel} data-testid="background-text-panel">
      {/* Tab Bar */}
      <div className={styles.tabBar} role="tablist" aria-label="Background & Text tools">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <div className={styles.content} style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {activeTab === 'gradients' && (
          <Suspense fallback={<div className={styles.loading}>Loading gradients...</div>}>
            <GradientPicker />
          </Suspense>
        )}
        {activeTab === 'color-kits' && (
          <Suspense fallback={<div className={styles.loading}>Loading color kits...</div>}>
            <ColorKitSelector />
          </Suspense>
        )}
        {activeTab === 'fonts' && (
          <Suspense fallback={<div className={styles.loading}>Loading fonts...</div>}>
            <FontLoaderPanel />
          </Suspense>
        )}
        {activeTab === 'text-effects' && (
          <Suspense fallback={<div className={styles.loading}>Loading text effects...</div>}>
            <TextEffectsPanel />
          </Suspense>
        )}
      </div>
    </div>
  )
}