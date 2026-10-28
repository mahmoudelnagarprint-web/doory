import { useMemo, useState } from 'react'
import type { IText } from 'fabric'
import { Rect } from 'fabric'
import { Check, Palette, Sparkles, Wand2 } from 'lucide-react'
import type { CollageFrameSpec, PageBackground } from '@/types/document'
import { useDocument, useEditor, useEditorState } from '../../context'
import { collageGroups } from '../../engine/collage/model'
import { defaultCollageStyle } from '../../engine/collage/layout'
import { slotClipStyle } from '../../engine/collage/shapeStyle'
import { withAlpha } from '../../engine/colors'
import { createElementFromSvg, createTextbox } from '../../engine/objects/factories'
import { asDory } from '../../engine/objects/dory'
import { syncDirection } from '../../engine/objects/textStyle'
import { fontStack } from '../../engine/text/fontStack'
import {
  COLLAGE_CATEGORIES,
  generateProcedural,
  justifiedFrames,
  nextLayoutSeed,
  presetsFor,
  type CollageCategoryId,
} from '../../collage/smartGenerators'
import { themesFromPhotos, type CollagePaletteTheme } from '../../collage/palette'
import { OCCASION_KITS, occasionFrames, type OccasionKit } from '../../collage/occasions'
import { collageStrings } from '../../strings/collage'
import { NumberField } from '../../ui/NumberField'
import styles from '../Collage.module.css'

export interface CollageSmartProps {
  /** The selected collage, or null while the panel is still on its create screen. */
  activeId: string | null
  /** Slot count of the active collage (used by Auto-fit and the occasion kits). */
  count: number
  page: { width: number; height: number }
  /** Called after a generated idea creates a new collage. */
  onPicked: (id: string) => void
  mode: 'layouts' | 'occasions'
}

function PresetThumb({ frames }: { frames: readonly CollageFrameSpec[] }) {
  return (
    <span className={styles.thumb} aria-hidden="true">
      {frames.map((frame, index) => {
        const clip = slotClipStyle(frame.mask ?? null, frame.width * 100, frame.height * 72, frame.radius ?? 0.18)
        return (
          <span
            key={index}
            className={styles.thumbSlot}
            style={{
              left: `${frame.x * 100}%`,
              top: `${frame.y * 100}%`,
              width: `${frame.width * 100}%`,
              height: `${frame.height * 100}%`,
              transform: frame.angle ? `rotate(${frame.angle}deg)` : undefined,
              ...clip,
            }}
          />
        )
      })}
    </span>
  )
}

function backgroundCss(background: PageBackground): string | undefined {
  if (background.type === 'solid') return background.color
  if (background.type === 'gradient') {
    const stops = background.stops.map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`).join(', ')
    return background.kind === 'radial'
      ? `radial-gradient(circle at 50% 20%, ${stops})`
      : `linear-gradient(${background.angle ?? 135}deg, ${stops})`
  }
  return undefined
}

/** The generated/branded half of the studio: layout ideas, photo palette and occasion kits. */
export function CollageSmart({ activeId, count, page, onPicked, mode }: CollageSmartProps) {
  const editor = useEditor()
  const activePageId = useEditorState((s) => s.activePageId)
  const doc = useDocument()
  const pageDoc = doc.pages.find((item) => item.id === activePageId)
  const groups = useMemo(() => collageGroups(pageDoc?.objects ?? []), [pageDoc?.objects])
  const active = activeId ? groups.find((group) => group.id === activeId) : undefined

  const [category, setCategory] = useState<CollageCategoryId>('grids')
  const [ideaCount, setIdeaCount] = useState(4)
  const [busy, setBusy] = useState(false)
  const [applyingKit, setApplyingKit] = useState<string | null>(null)
  const [themes, setThemes] = useState<CollagePaletteTheme[] | null>(null)
  const [themeId, setThemeId] = useState<string | null>(null)
  const [matching, setMatching] = useState(false)

  const slots = activeId ? count : ideaCount
  const presets = useMemo(() => presetsFor(category, slots), [category, slots])
  const activeCategory = COLLAGE_CATEGORIES.find((item) => item.id === category)

  const applyFrames = async (frames: CollageFrameSpec[], label: string, name?: string): Promise<void> => {
    if (frames.length === 0) return
    setBusy(true)
    try {
      if (activeId) {
        editor.collage.applyFrames(activeId, frames, label)
      } else {
        const id = await editor.collage.create({ frames, name })
        onPicked(id)
      }
    } finally {
      setBusy(false)
    }
  }

  const generateIdea = (): void => {
    void applyFrames(generateProcedural(nextLayoutSeed(), slots, 'auto'), 'Generate layout idea', 'Generated collage')
  }

  const autoFit = (): void => {
    if (!activeId) return
    const aspects = editor.collage.slotAspects(activeId)
    const list = aspects.length > 0 ? aspects : Array.from({ length: slots }, () => 1.5)
    void applyFrames(justifiedFrames(list, page.height / Math.max(1, page.width)), 'Auto-fit collage')
  }

  const matchColors = async (): Promise<void> => {
    if (!activeId) return
    setMatching(true)
    try {
      const srcs = (active?.slots ?? [])
        .map((slot) => (typeof slot.docSrc === 'string' ? slot.docSrc : typeof slot.src === 'string' ? slot.src : null))
        .filter((src): src is string => !!src)
      const resolved = await Promise.all(srcs.map(async (src) => {
        try {
          return await editor.assets.resolve(src)
        } catch {
          return null
        }
      }))
      setThemes(await themesFromPhotos([...new Set(resolved.filter((url): url is string => !!url))]))
      setThemeId(null)
    } catch {
      editor.toast(collageStrings.paletteFailed, 'error')
    } finally {
      setMatching(false)
    }
  }

  const applyTheme = (theme: CollagePaletteTheme): void => {
    if (!activeId) return
    editor.pages.setBackground(activePageId, theme.background)
    editor.collage.setStyle(activeId, theme.style)
    setThemeId(theme.id)
  }

  const addDecor = async (kit: OccasionKit): Promise<void> => {
    const minSide = Math.min(page.width, page.height)
    const k = Math.max(0.65, minSide / 559)
    const badgeWidth = page.width * 0.7
    const badgeHeight = Math.max(52, Math.min(page.height * 0.12, 160))
    const cx = page.width / 2
    const cy = page.height - badgeHeight / 2 - minSide * 0.055
    const radius = Math.min(16, badgeHeight * 0.3)
    const badge = new Rect({
      left: cx,
      top: cy,
      originX: 'center',
      originY: 'center',
      width: badgeWidth,
      height: badgeHeight,
      rx: radius,
      ry: radius,
      fill: withAlpha(kit.badgeColor, 0.94),
      stroke: kit.accent,
      strokeWidth: Math.max(1, Math.round(1.5 * k)),
      strokeUniform: true,
    })
    asDory(badge).name = `${kit.label} badge`

    await editor.fonts.load('Cairo', 700, 'normal', kit.titleAr)
    const title = createTextbox(page, { x: cx, y: cy - badgeHeight * 0.14 }, {
      text: kit.titleAr,
      fontFamily: fontStack('Cairo', 'sans-serif'),
      fontSize: Math.round(26 * k),
      fontWeight: 700,
      fill: kit.textColor,
      textAlign: 'center',
      width: Math.round(badgeWidth * 0.9),
    })
    const titleData = asDory(title)
    titleData.textDir = 'rtl'
    titleData.name = `${kit.label} title`
    syncDirection(title as unknown as IText)

    const subtitle = createTextbox(page, { x: cx, y: cy + badgeHeight * 0.24 }, {
      text: kit.titleEn,
      fontFamily: fontStack('Cairo', 'sans-serif'),
      fontSize: Math.round(13 * k),
      fontWeight: 500,
      fill: kit.accent,
      textAlign: 'center',
      width: Math.round(badgeWidth * 0.9),
    })
    asDory(subtitle).name = `${kit.label} subtitle`

    const stickers = await Promise.all(kit.stickers.map(async (sticker) => {
      const object = await createElementFromSvg(
        sticker.svg,
        { x: page.width * sticker.x, y: page.height * sticker.y },
        Math.round(sticker.size * minSide),
        { elementId: `occasion:${kit.id}:${sticker.id}`, name: sticker.name },
      )
      if (sticker.opacity !== undefined) object.set('opacity', sticker.opacity)
      return object
    }))

    await editor.insert.add([badge, title, subtitle, ...stickers], `Apply ${kit.label} decor`, { select: [title] })
  }

  const applyKit = async (kit: OccasionKit): Promise<void> => {
    setBusy(true)
    setApplyingKit(kit.id)
    try {
      const frames = occasionFrames(kit, slots)
      let target = activeId
      if (target) {
        editor.collage.applyFrames(target, frames, `Apply ${kit.label} layout`)
      } else {
        target = await editor.collage.create({ frames, name: kit.label })
        onPicked(target)
      }
      editor.pages.setBackground(activePageId, kit.background)
      editor.collage.setStyle(target, { ...kit.style, shadow: defaultCollageStyle(page).shadow })
      await addDecor(kit)
    } finally {
      setBusy(false)
      setApplyingKit(null)
    }
  }

  if (mode === 'occasions') {
    return (
      <>
        <div className={styles.sectionTitle}>{collageStrings.occasions}</div>
        <p className={styles.hint}>{collageStrings.occasionsHint}</p>
        <div className={styles.occasionGrid}>
          {OCCASION_KITS.map((kit) => (
            <button
              key={kit.id}
              type="button"
              className={styles.occasionCard}
              disabled={busy}
              aria-busy={applyingKit === kit.id || undefined}
              onClick={() => void applyKit(kit)}
            >
              <span className={styles.occasionSwatch} style={{ background: backgroundCss(kit.background), borderColor: kit.accent }} aria-hidden="true" />
              <span className={styles.occasionTitle}>{kit.label}</span>
              <span className={styles.occasionTitleAr} dir="rtl">{kit.titleAr}</span>
              <small>{kit.hint}</small>
            </button>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <div className={styles.smartBar}>
        <button type="button" className={`${styles.primary} ${styles.wide}`} onClick={generateIdea} disabled={busy}>
          <Sparkles size={14} aria-hidden="true" /> {collageStrings.generateIdea}
        </button>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={autoFit} disabled={busy || !activeId}>
            <Wand2 size={14} aria-hidden="true" /> {collageStrings.autoFit}
          </button>
          <button type="button" className={styles.secondary} onClick={() => void matchColors()} disabled={busy || matching || !activeId} aria-busy={matching || undefined}>
            <Palette size={14} aria-hidden="true" /> {collageStrings.matchColors}
          </button>
        </div>
      </div>
      <p className={styles.hint}>{collageStrings.ideaHint}</p>

      {!activeId ? (
        <div className={styles.rowBetween}>
          <span className={styles.label}>{collageStrings.photoCount}</span>
          <NumberField label={collageStrings.photoCount} value={ideaCount} min={1} max={16} showLabel={false} width={64} onChange={setIdeaCount} />
        </div>
      ) : null}

      <div className={styles.chips} role="group" aria-label={collageStrings.categories}>
        {COLLAGE_CATEGORIES.map((item) => (
          <button key={item.id} type="button" className={styles.chip} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {activeCategory ? <p className={styles.hint}>{activeCategory.hint}</p> : null}

      <div className={styles.templateGrid}>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.templateCard}
            disabled={busy}
            title={`${preset.name} · ${preset.count} ${collageStrings.slots}`}
            onClick={() => void applyFrames(preset.frames, 'Apply layout idea')}
          >
            <PresetThumb frames={preset.frames} />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>

      {themes ? (
        <>
          <div className={styles.sectionTitle}>{collageStrings.palette}</div>
          <div className={styles.paletteGrid}>
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`${styles.paletteCard} ${themeId === theme.id ? styles.templateOn : ''}`}
                aria-pressed={themeId === theme.id}
                onClick={() => applyTheme(theme)}
                disabled={busy || !activeId}
              >
                <span className={styles.swatches} aria-hidden="true">
                  {theme.swatches.map((color, index) => (
                    <span key={`${color}-${index}`} className={styles.swatch} style={{ background: color }} />
                  ))}
                </span>
                <span className={styles.paletteName}>{theme.name}</span>
                {themeId === theme.id ? <Check size={12} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          <p className={styles.hint}>{collageStrings.paletteHint}</p>
        </>
      ) : null}
    </>
  )
}
