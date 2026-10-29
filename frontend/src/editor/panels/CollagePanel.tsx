import { lazy, Suspense, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Grid, LayoutGrid, Palette, RotateCcw, Search, Sparkles, Sticker, Type, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import type { LocalAsset } from '@/types/api'
import type { CollageLayoutId, ImageFilterSpec } from '@/types/document'
import { useDocument, useEditor, useEditorState } from '../context'
import { asDory } from '../engine/objects/dory'
import { FILTER_PRESETS } from '../engine/objects/filters'
import { COLLAGE_LAYOUTS, defaultCollageStyle, resolveLayout } from '../engine/collage/layout'
import { collageGroups, collageInSelection, slotOfDocObject } from '../engine/collage/model'
import { SLOT_SHAPES, slotClipStyle } from '../engine/collage/shapeStyle'
import type { CollageFont, CollageTextVariant } from '../engine/api/collage'
import { useLocalAssets } from '../hooks/useLocalAssets'
import { useResolvedSrc } from '../hooks/useResolvedSrc'
import { collageStrings } from '../strings/collage'
import { NumberField } from '../ui/NumberField'
import { Slider } from '../ui/Slider'
import { Switch } from '../ui/Switch'
import { ColorButton } from '../ui/ColorButton'
import type { PanelProps } from './registry'
import styles from './Collage.module.css'

type Tab = 'layout' | 'occasions' | 'slots' | 'style' | 'type' | 'stickers'

const TABS: readonly { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'layout', label: collageStrings.layout, icon: LayoutGrid },
  { id: 'occasions', label: collageStrings.occasions, icon: Sparkles },
  { id: 'slots', label: collageStrings.slots, icon: Grid },
  { id: 'style', label: collageStrings.style, icon: Palette },
  { id: 'type', label: collageStrings.type, icon: Type },
  { id: 'stickers', label: collageStrings.stickers, icon: Sticker },
]

/** Generated catalogs and the occasion kits live in their own chunk, loaded with the studio. */
const CollageSmart = lazy(() => import('./collage/CollageSmart').then((module) => ({ default: module.CollageSmart })))

/** Smart Design Deconstructor — lazy-loaded so the initial editor bundle stays ≤460 kB gzip. */
const DeconstructStudio = lazy(() => import('../collage/deconstructor/DeconstructStudioModal').then((module) => ({ default: module.default })))

const FONTS: readonly { id: CollageFont; sample: string; family: string }[] = [
  { id: 'Cairo', sample: 'القاهرة', family: '"Cairo", sans-serif' },
  { id: 'Amiri', sample: 'أميري', family: '"Amiri", serif' },
  { id: 'Tajawal', sample: 'تجوال', family: '"Tajawal", sans-serif' },
]

const VARIANTS: readonly { id: CollageTextVariant; label: string }[] = [
  { id: 'headline', label: collageStrings.headline },
  { id: 'subhead', label: collageStrings.subhead },
  { id: 'body', label: collageStrings.body },
  { id: 'caption', label: collageStrings.caption },
]

function TemplateThumb({ layout }: { layout: CollageLayoutId }) {
  const frames = useMemo(() => resolveLayout(layout, layout === 'mosaic' ? 4 : 4, { x: 0, y: 0, width: 100, height: 72 }, 4, 4, false), [layout])
  return (
    <span className={styles.thumb} aria-hidden="true">
      {frames.map((frame, index) => (
        <span
          key={index}
          className={styles.thumbSlot}
          style={{
            left: `${frame.cx - frame.width / 2}%`,
            top: `${((frame.cy - frame.height / 2) / 72) * 100}%`,
            width: `${frame.width}%`,
            height: `${(frame.height / 72) * 100}%`,
            transform: `rotate(${frame.angle}deg)`,
          }}
        />
      ))}
    </span>
  )
}

function SlotThumb({ src, index, filled }: { src?: string; index: number; filled: boolean }) {
  const resolved = useResolvedSrc(src)
  if (resolved) return <img src={resolved} alt="" draggable={false} />
  return (
    <span className={styles.slotFallback} aria-hidden="true">
      {filled ? <Check size={17} /> : <span>{index + 1}</span>}
    </span>
  )
}

/** The Smart Collage panel: layout, photos, mat/frame, Arabic type and transparent stickers for one collage. */
export function CollagePanel(_props: PanelProps) {
  const editor = useEditor()
  const activePageId = useEditorState((s) => s.activePageId)
  const selection = useEditorState((s) => s.selection)
  const stageMode = useEditorState((s) => s.ui.stageMode)
  const doc = useDocument()
  const page = doc.pages.find((p) => p.id === activePageId)
  const groups = useMemo(() => collageGroups(page?.objects ?? []), [page?.objects])
  const selected = collageInSelection(selection.objects)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('layout')
  const [creating, setCreating] = useState<CollageLayoutId | null>(null)
  const [busy, setBusy] = useState(false)
  const [font, setFont] = useState<CollageFont>('Cairo')
  const [variant, setVariant] = useState<CollageTextVariant>('headline')
  const [deconstructOpen, setDeconstructOpen] = useState(false)

  const picked = pickedId && groups.some((group) => group.id === pickedId) ? pickedId : null
  const activeId = selected?.id ?? picked ?? groups[0]?.id ?? null
  const active = groups.find((group) => group.id === activeId)
  const selectedSlotId = selected && selected.id === activeId ? selected.slot.id : active?.slots[0]?.id
  const activeSlot = active?.slots.find((slot) => slot.id === selectedSlotId) ?? active?.slots[0]
  const liveSlot = activeSlot ? editor.activeView()?.getById(activeSlot.id) : undefined
  const liveSlotData = liveSlot ? asDory(liveSlot).slot : undefined
  const liveCentre = liveSlot?.getCenterPoint()
  const slotFrame = liveSlotData ?? (activeSlot ? slotOfDocObject(activeSlot) : undefined)
  const panX = slotFrame && liveCentre ? Math.round(liveCentre.x - slotFrame.cx) : 0
  const panY = slotFrame && liveCentre ? Math.round(liveCentre.y - slotFrame.cy) : 0
  const activeMask = slotFrame?.mask
  const shapeChoice: string | null = activeMask && typeof activeMask === 'string' ? activeMask : null
  const pageSize = editor.pageSizeOf(activePageId)
  const step = Math.max(2, Math.round(Math.min(pageSize.width, pageSize.height) * 0.01))
  const filters = (activeSlot?.filterSpecs as ImageFilterSpec[] | undefined) ?? []
  const activeFilter = FILTER_PRESETS.find((preset) => JSON.stringify(preset.specs) === JSON.stringify(filters))?.id ?? 'none'

  const create = async (template: CollageLayoutId): Promise<void> => {
    setCreating(template)
    setBusy(true)
    try {
      const id = await editor.collage.create({ template, count: 4 })
      setPickedId(id)
      setTab('layout')
    } finally {
      setBusy(false)
      setCreating(null)
    }
  }

  const choosePhoto = async (): Promise<void> => {
    if (!activeSlot) return
    setBusy(true)
    try {
      await editor.collage.fillSlot(activeSlot.id)
    } finally {
      setBusy(false)
    }
  }

  const addText = async (): Promise<void> => {
    setBusy(true)
    try {
      await editor.collage.addText(font, variant)
    } finally {
      setBusy(false)
    }
  }

  if (!active) {
    return (
      <div className={styles.panel} data-testid="collage-panel">
        <div className={styles.scroll}>
          <div className={styles.intro}>
            <span className={styles.studioMark}>STUDIO</span>
            <h3>{collageStrings.intro}</h3>
            <p>{collageStrings.introHint}</p>
          </div>
          <div className={styles.createLabel}>{collageStrings.template}</div>
          <div className={styles.templateGrid}>
            {COLLAGE_LAYOUTS.map((layout) => (
              <button
                key={layout}
                type="button"
                className={`${styles.templateCard} ${creating === layout ? styles.templateBusy : ''}`}
                onClick={() => void create(layout)}
                disabled={busy}
                aria-busy={creating === layout || undefined}
              >
                <TemplateThumb layout={layout} />
                <span>{collageStrings.templates[layout]}</span>
              </button>
            ))}
          </div>
          <button type="button" className={`${styles.primary} ${styles.wide}`} onClick={() => void create('grid')} disabled={busy}>
            {collageStrings.create}
          </button>
          <p className={styles.hint}>{collageStrings.createHint}</p>

          <div className={styles.sectionTitle}>{collageStrings.ideas}</div>
          <Suspense fallback={null}>
            <CollageSmart
              activeId={null}
              count={4}
              page={pageSize}
              mode="layouts"
              onPicked={(id) => {
                setPickedId(id)
                setTab('layout')
              }}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel} data-testid="collage-panel">
      <div className={styles.head}>
        <div>
          <span className={styles.studioMark}>STUDIO</span>
          <strong>{active.name}</strong>
        </div>
        <span className={styles.badge}>{active.slots.length} {collageStrings.slots}</span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label={collageStrings.title}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" className={styles.tab} aria-selected={tab === id} onClick={() => setTab(id)}>
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <button type="button" className={styles.deconstructBtn} onClick={() => setDeconstructOpen(true)} aria-label="تفكيك قالب ذكي">
        <span>تفكيك قالب ذكي</span>
      </button>

      {deconstructOpen && (
        <Suspense fallback={<div>Loading Smart Design Deconstructor…</div>}>
          <DeconstructStudio imageUrl={String(activeSlot?.src ?? '')} onBuild={(res) => console.log('Deconstructor result:', res)} onClose={() => setDeconstructOpen(false)} />
        </Suspense>
      )}

      <div className={styles.scroll}>
        {tab === 'layout' ? (
          <>
            <div className={styles.sectionTitle}>{collageStrings.template}</div>
            <div className={styles.templateGrid}>
              {COLLAGE_LAYOUTS.map((layout) => (
                <button
                  key={layout}
                  type="button"
                  className={`${styles.templateCard} ${active.layout === layout ? styles.templateOn : ''}`}
                  onClick={() => editor.collage.setLayout(active.id, layout)}
                  disabled={busy}
                >
                  <TemplateThumb layout={layout} />
                  <span>{collageStrings.templates[layout]}</span>
                </button>
              ))}
            </div>

            <div className={styles.sectionTitle}>{collageStrings.ideas}</div>
            <Suspense fallback={null}>
              <CollageSmart
                key={active.id}
                activeId={active.id}
                count={active.slots.length}
                page={pageSize}
                mode="layouts"
                onPicked={setPickedId}
              />
            </Suspense>

            <div className={styles.rowBetween}>
              <span className={styles.label}>{collageStrings.slotCount}</span>
              <NumberField label={collageStrings.slotCount} value={active.slots.length} min={1} max={16} showLabel={false} width={64} onChange={(value) => editor.collage.setCount(active.id, value)} />
            </div>
            <Slider label={collageStrings.gap} value={active.gap} min={0} max={Math.round(Math.min(pageSize.width, pageSize.height) * 0.16)} step={1} display={`${Math.round(active.gap)} px`} onChange={(value) => editor.collage.setGap(active.id, value)} />
            <Slider label={collageStrings.margin} value={active.margin} min={0} max={Math.round(Math.min(pageSize.width, pageSize.height) * 0.3)} step={1} display={`${Math.round(active.margin)} px`} onChange={(value) => editor.collage.setMargin(active.id, value)} />
            <Switch label={collageStrings.rtl} checked={active.rtl} onChange={(value) => editor.collage.setRtl(active.id, value)} hint={collageStrings.rtlHint} />

            <div className={styles.sectionTitle}>{collageStrings.move}</div>
            <div className={styles.moveRow}>
              <button type="button" className={styles.iconBtn} onClick={() => editor.collage.moveCollage(active.id, 0, -step)} aria-label={`${collageStrings.move} ↑`}>
                <ArrowUp size={16} />
              </button>
              <button type="button" className={styles.iconBtn} onClick={() => editor.collage.moveCollage(active.id, -step, 0)} aria-label={`${collageStrings.move} ←`}>
                <ArrowLeft size={16} />
              </button>
              <button type="button" className={styles.iconBtn} onClick={() => editor.collage.moveCollage(active.id, 0, step)} aria-label={`${collageStrings.move} ↓`}>
                <ArrowDown size={16} />
              </button>
              <button type="button" className={styles.iconBtn} onClick={() => editor.collage.moveCollage(active.id, step, 0)} aria-label={`${collageStrings.move} →`}>
                <ArrowRight size={16} />
              </button>
            </div>
            <p className={styles.hint}>{collageStrings.moveHint}</p>
          </>
        ) : null}

        {tab === 'occasions' ? (
          <Suspense fallback={null}>
            <CollageSmart key={active.id} activeId={active.id} count={active.slots.length} page={pageSize} mode="occasions" onPicked={setPickedId} />
          </Suspense>
        ) : null}

        {tab === 'slots' ? (
          <>
            <div className={styles.sectionTitle}>{collageStrings.stage}</div>
            <div className={styles.segmented} role="group" aria-label={collageStrings.stage}>
              <button type="button" className={styles.chip} aria-pressed={stageMode === 'pan-photo'} onClick={() => editor.patchUi({ stageMode: 'pan-photo' })}>
                {collageStrings.panPhoto}
              </button>
              <button type="button" className={styles.chip} aria-pressed={stageMode === 'edit-frame'} onClick={() => editor.patchUi({ stageMode: 'edit-frame' })}>
                {collageStrings.editFrame}
              </button>
            </div>
            <p className={styles.hint}>{collageStrings.stageHint}</p>

            <div className={styles.sectionTitle}>{collageStrings.slots}</div>
            <div className={styles.slotGrid}>
              {active.slots.map((slot, index) => {
                const filled = slot.isPlaceholder !== true
                const src = typeof slot.docSrc === 'string' ? slot.docSrc : typeof slot.src === 'string' ? slot.src : undefined
                return (
                  <button
                    key={slot.id}
                    type="button"
                    className={`${styles.slotTile} ${activeSlot?.id === slot.id ? styles.slotOn : ''}`}
                    onClick={() => {
                      setPickedId(active.id)
                      editor.collage.selectSlot(slot.id)
                    }}
                    aria-pressed={activeSlot?.id === slot.id}
                  >
                    <SlotThumb src={src} index={index} filled={filled} />
                    <span>{collageStrings.slotName(index + 1)}</span>
                    <small>{filled ? collageStrings.filled : collageStrings.empty}</small>
                  </button>
                )
              })}
            </div>

            {activeSlot ? (
              <div className={styles.photoCard}>
                <div className={styles.rowBetween}>
                  <span className={styles.photoName}>{activeSlot.name ?? collageStrings.slotName((activeSlot.collage?.index ?? 0) + 1)}</span>
                  <span className={styles.status}>{activeSlot.isPlaceholder === true ? collageStrings.empty : collageStrings.filled}</span>
                </div>
                <div className={styles.actions}>
                  <button type="button" className={styles.primary} onClick={() => void choosePhoto()} disabled={busy}>
                    {activeSlot.isPlaceholder === true ? collageStrings.choosePhoto : collageStrings.replacePhoto}
                  </button>
                  {activeSlot.isPlaceholder !== true ? (
                    <button type="button" className={styles.secondary} onClick={() => editor.collage.clearSlot(activeSlot.id)}>
                      {collageStrings.clear}
                    </button>
                  ) : null}
                </div>

                <div className={styles.shapeRow} role="group" aria-label={collageStrings.shape}>
                  <span className={styles.label}>{collageStrings.shape}</span>
                  {SLOT_SHAPES.map((shape) => {
                    const name = shape ? collageStrings.shapes[shape] : collageStrings.shapes.rect
                    return (
                      <button
                        key={shape ?? 'rect'}
                        type="button"
                        className={styles.shapeChip}
                        aria-pressed={shapeChoice === shape}
                        aria-label={name}
                        title={name}
                        onClick={() => editor.collage.setSlotMask(activeSlot.id, shape)}
                      >
                        <span className={styles.shapeDot} style={slotClipStyle(shape, 18, 14)} aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>

                {activeSlot.isPlaceholder !== true ? (
                  <>
                    <div className={styles.rowBetween}>
                      <span className={styles.label}>{collageStrings.zoom}</span>
                      <span className={styles.zoomRow}>
                        <button type="button" className={styles.iconBtn} onClick={() => editor.collage.setSlotZoom(activeSlot.id, 0.88)} aria-label={collageStrings.zoomOut}>
                          <ZoomOut size={15} />
                        </button>
                        <button type="button" className={styles.iconBtn} onClick={() => editor.collage.setSlotZoom(activeSlot.id, 1.14)} aria-label={collageStrings.zoomIn}>
                          <ZoomIn size={15} />
                        </button>
                      </span>
                    </div>
                    <Slider label={collageStrings.tilt} value={Math.round(Number(activeSlot.angle ?? 0))} min={-18} max={18} step={1} display={`${Math.round(Number(activeSlot.angle ?? 0))}°`} onChange={(value) => editor.collage.setSlotTilt(activeSlot.id, value)} />
                    <div className={styles.pair}>
                      <NumberField label={collageStrings.panX} value={panX} min={-pageSize.width} max={pageSize.width} showLabel={false} width={86} onChange={(value) => editor.collage.setSlotPan(activeSlot.id, value, panY)} />
                      <NumberField label={collageStrings.panY} value={panY} min={-pageSize.height} max={pageSize.height} showLabel={false} width={86} onChange={(value) => editor.collage.setSlotPan(activeSlot.id, panX, value)} />
                      <button type="button" className={styles.secondary} onClick={() => editor.collage.setSlotPan(activeSlot.id, 0, 0)}>
                        {collageStrings.centerPhoto}
                      </button>
                    </div>
                  </>
                ) : null}

                <div className={styles.sectionTitle}>{collageStrings.filters}</div>
                <div className={styles.chips}>
                  {FILTER_PRESETS.map((preset) => (
                    <button key={preset.id} type="button" className={styles.chip} aria-pressed={activeFilter === preset.id} onClick={() => editor.collage.applyFilterPreset(activeSlot.id, preset.id)}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : <p className={styles.hint}>{collageStrings.pickSlot}</p>}
          </>
        ) : null}

        {tab === 'style' ? (
          <>
            <div className={styles.stylePreview} aria-hidden="true">
              <span className={styles.previewMat} style={{ background: active.style.matColor, borderRadius: `${active.style.radius}px`, boxShadow: active.style.shadow ? '0 10px 24px rgba(0,0,0,.45)' : undefined }} />
              <span className={styles.previewGold} style={{ borderColor: active.style.outerColor, borderRadius: `${active.style.radius}px` }} />
            </div>
            <div className={styles.sectionTitle}>{collageStrings.frame}</div>
            <div className={styles.colorRow}>
              <ColorButton label={collageStrings.matColor} value={{ type: 'solid', color: active.style.matColor }} solidOnly onChange={(fill) => editor.collage.setStyle(active.id, { matColor: fill.type === 'solid' ? fill.color : active.style.matColor })} />
              <span>{collageStrings.matColor}</span>
            </div>
            <div className={styles.colorRow}>
              <ColorButton label={collageStrings.outerColor} value={{ type: 'solid', color: active.style.outerColor }} solidOnly onChange={(fill) => editor.collage.setStyle(active.id, { outerColor: fill.type === 'solid' ? fill.color : active.style.outerColor })} />
              <span>{collageStrings.outerColor}</span>
            </div>
            <div className={styles.colorRow}>
              <ColorButton label={collageStrings.innerColor} value={{ type: 'solid', color: active.style.innerColor }} solidOnly onChange={(fill) => editor.collage.setStyle(active.id, { innerColor: fill.type === 'solid' ? fill.color : active.style.innerColor })} />
              <span>{collageStrings.innerColor}</span>
            </div>
            <Slider label={collageStrings.mat} value={active.style.matWidth} min={0} max={Math.round(Math.min(pageSize.width, pageSize.height) * 0.08)} step={1} display={`${Math.round(active.style.matWidth)} px`} onChange={(value) => editor.collage.setStyle(active.id, { matWidth: value })} />
            <Slider label={collageStrings.outerWidth} value={active.style.outerWidth} min={0} max={16} step={1} display={`${Math.round(active.style.outerWidth)} px`} onChange={(value) => editor.collage.setStyle(active.id, { outerWidth: value })} />
            <Slider label={collageStrings.innerWidth} value={active.style.innerWidth} min={0} max={16} step={1} display={`${Math.round(active.style.innerWidth)} px`} onChange={(value) => editor.collage.setStyle(active.id, { innerWidth: value })} />
            <Slider label={collageStrings.radius} value={active.style.radius} min={0} max={Math.round(Math.min(pageSize.width, pageSize.height) * 0.2)} step={1} display={`${Math.round(active.style.radius)} px`} onChange={(value) => editor.collage.setStyle(active.id, { radius: value })} />
            <Switch
              label={collageStrings.shadow}
              checked={!!active.style.shadow}
              onChange={(checked) => editor.collage.setStyle(active.id, { shadow: checked ? defaultCollageStyle(pageSize).shadow : undefined })}
            />
            <button type="button" className={styles.secondary} onClick={() => editor.collage.setStyle(active.id, defaultCollageStyle(pageSize))}>
              <RotateCcw size={14} /> {collageStrings.resetStyle}
            </button>
          </>
        ) : null}

        {tab === 'type' ? (
          <>
            <div className={styles.sectionTitle}>{collageStrings.font}</div>
            <div className={styles.fontGrid}>
              {FONTS.map((item) => (
                <button key={item.id} type="button" className={`${styles.fontCard} ${font === item.id ? styles.fontOn : ''}`} onClick={() => setFont(item.id)} aria-pressed={font === item.id}>
                  <span className={styles.arabicSample} style={{ fontFamily: item.family }} dir="rtl">
                    {item.sample}
                  </span>
                  <span>{item.id}</span>
                </button>
              ))}
            </div>
            <div className={styles.segmented} role="group" aria-label={collageStrings.type}>
              {VARIANTS.map((item) => (
                <button key={item.id} type="button" className={styles.chip} aria-pressed={variant === item.id} onClick={() => setVariant(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" className={`${styles.primary} ${styles.wide}`} onClick={() => void addText()} disabled={busy} aria-busy={busy || undefined}>
              {collageStrings.addText}
            </button>
            <button type="button" className={styles.secondary} onClick={() => void editor.insert.text('heading')}>
              {collageStrings.addEnglish}
            </button>
            <p className={styles.hint} dir="rtl">{collageStrings.typeHint}</p>
          </>
        ) : null}

        {tab === 'stickers' ? <StickersTab busy={busy} setBusy={setBusy} /> : null}
      </div>
    </div>
  )
}

function StickersTab({ busy, setBusy }: { busy: boolean; setBusy: (busy: boolean) => void }) {
  const editor = useEditor()
  const { assets, enabled, loading, failed, reload } = useLocalAssets()
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return assets
    return assets.filter((asset) => asset.name.toLowerCase().includes(needle) || asset.path.toLowerCase().includes(needle))
  }, [assets, query])

  const add = async (asset: LocalAsset): Promise<void> => {
    setBusy(true)
    try {
      await editor.collage.addSticker(asset)
    } catch {
      editor.toast(collageStrings.stickerFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={styles.search}>
        <Search size={14} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={collageStrings.stickerSearch} aria-label={collageStrings.stickerSearch} />
      </div>
      <button type="button" className={styles.primary} onClick={() => void editor.insert.pickAndInsertImages()} disabled={busy}>
        <Upload size={14} /> {collageStrings.uploadSticker}
      </button>
      {loading ? <p className={styles.hint}>Loading…</p> : null}
      {!loading && failed ? (
        <button type="button" className={styles.secondary} onClick={reload}>
          Retry
        </button>
      ) : null}
      {!loading && !failed && (!enabled || visible.length === 0) ? <p className={styles.hint}>{collageStrings.noStickers}</p> : null}
      {visible.length > 0 ? (
        <div className={styles.stickerGrid}>
          {visible.map((asset) => (
            <button key={asset.path} type="button" className={styles.sticker} onClick={() => void add(asset)} disabled={busy} title={asset.path}>
              <img src={asset.url} alt="" draggable={false} loading="lazy" />
              <span>{asset.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      <p className={styles.hint}>{collageStrings.stickerHint}</p>
    </>
  )
}
