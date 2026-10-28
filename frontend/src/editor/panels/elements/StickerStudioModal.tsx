/**
 * AI Sticker Studio & Custom Vault — lazily loaded from the Stickers tab.
 *
 * Tabs:
 * - **Create** — upload files or a whole folder ("إضافة فولدر كامل"), batch-cut every
 *   image through the dual-mode engine (`@/lib/ai/stickerCutout`) into the IndexedDB
 *   vault with a live "Processing 14 / 85 stickers…" bar. One picked file jumps
 *   straight into the refine studio (`RefineCanvas`).
 * - **Vault** — "مكتبتي الخاصة / My Stickers": rename inline, category pills and a
 *   category manager, delete, export/import the library as `.json`, click or drag a
 *   sticker onto the canvas (inserted images keep full CutContour die-cut support).
 *
 * Everything here — and `stickerCutout` with it — loads only when the user opens the
 * studio, so the editor's initial bundle stays within its 460 kB budget.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  FolderOpen,
  ImagePlus,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { useEditor } from '../../context'
import { createStickerCutout, type CutoutModeChoice } from '@/lib/ai/stickerCutout'
import {
  addSticker,
  deleteSticker,
  exportVault,
  importVault,
  listStickers,
  updateSticker,
  type StickerRecord,
  type StickerVaultExport,
} from '@/lib/storage/stickerVault'
import { RefineCanvas } from './RefineCanvas'
import styles from './StickerStudioModal.module.css'

/* ---------------------------------------------------------------- helpers */

function dataUrlToFile(dataUrl: string, name: string): File {
  const comma = dataUrl.indexOf(',')
  const b64 = dataUrl.slice(comma + 1)
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], `${name}.png`, { type: 'image/png' })
}

function downloadJson(payload: StickerVaultExport): void {
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'doory-sticker-vault.json'
  link.click()
  URL.revokeObjectURL(url)
}

function cleanFileName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Sticker'
}

function relativeFolderOf(file: File): string | null {
  const withPath = file as File & { webkitRelativePath?: string }
  const path = typeof withPath.webkitRelativePath === 'string' ? withPath.webkitRelativePath : ''
  return path.split('/')[0] || null
}

interface QueueItem {
  id: string
  file: File
  name: string
  category: string
  status: 'pending' | 'working' | 'done' | 'failed'
  mode?: string
  record?: StickerRecord
  error?: string
}

export interface StickerStudioModalProps {
  /** Which tab opens first. */
  start: 'create' | 'vault'
  /** A file picked from outside goes straight into the refine studio. */
  initialFile?: File | null
  onClose(): void
}

/* ============================================================== component */

export function StickerStudioModal({ start, initialFile, onClose }: StickerStudioModalProps) {
  const editor = useEditor()
  const [tab, setTab] = useState<'create' | 'vault'>(start)
  const [refine, setRefine] = useState<{ file: File; category: string } | null>(() =>
    initialFile ? { file: initialFile, category: relativeFolderOf(initialFile) ?? 'عام' } : null,
  )
  const returnTabRef = useRef<'create' | 'vault'>('create')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  /* ------------------------------------------------------------ create tab */

  const [modeChoice, setModeChoice] = useState<CutoutModeChoice>('auto')
  const [tolerance, setTolerance] = useState(40)
  const [edgeChoke, setEdgeChoke] = useState(0)
  const [edgeFeather, setEdgeFeather] = useState(1)
  const [borderPx, setBorderPx] = useState(0)
  const [borderColor, setBorderColor] = useState('#ffffff')
  const [borderShadow, setBorderShadow] = useState(false)
  const [categoryOverride, setCategoryOverride] = useState('')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [progressLabel, setProgressLabel] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  /* ----------------------------------------------------------------- vault */

  const [stickers, setStickers] = useState<StickerRecord[]>([])
  const refreshVault = useCallback(async (): Promise<void> => {
    try {
      setStickers(await listStickers())
    } catch {
      editor.toast('Could not read the sticker vault', 'error')
    }
  }, [editor])

  const pendingFromFiles = useCallback(
    (files: readonly File[], folderOfFirst: string | null): QueueItem[] =>
      files.map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        name: cleanFileName(file.name),
        category: folderOfFirst ?? (categoryOverride.trim() || 'عام'),
        status: 'pending',
      })),
    [categoryOverride],
  )

  /** A single picked file goes straight to the refine studio; the rest queue up. */
  const onPickFiles = useCallback(
    (list: FileList | null, fromFolder: boolean): void => {
      if (!list) return
      const files = Array.from(list).filter((file) => file.type.startsWith('image/'))
      if (files.length === 0) return
      const folder = fromFolder ? relativeFolderOf(files[0]) : null
      if (!fromFolder && files.length === 1) {
        returnTabRef.current = tab
        setRefine({ file: files[0], category: folder ?? (categoryOverride.trim() || 'عام') })
        return
      }
      setQueue((prev) => [
        ...prev,
        ...files.map((file, index) => ({
          id: `${Date.now()}-${prev.length + index}-${file.name}`,
          file,
          name: cleanFileName(file.name),
          category: folder ?? (categoryOverride.trim() || 'عام'),
          status: 'pending' as const,
        })),
      ])
    },
    [categoryOverride, tab],
  )

  const runBatch = useCallback(async (): Promise<void> => {
    const pending = queue.filter((item) => item.status === 'pending')
    if (pending.length === 0 || processing) return
    const controller = new AbortController()
    abortRef.current = controller
    setProcessing(true)
    const total = queue.length
    let doneBefore = total - pending.length
    for (const item of pending) {
      setProgressLabel(`Processing ${doneBefore + 1} / ${total} stickers… · جارٍ المعالجة`)
      setProgressPercent(Math.round((doneBefore / total) * 100))
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'working' } : q)))
      try {
        const result = await createStickerCutout(item.file, {
          mode: modeChoice,
          tolerance,
          edgeChoke,
          edgeFeather,
          signal: controller.signal,
        })
        const record = await addSticker({
          name: item.name,
          category: item.category,
          dataUrl: result.dataUrl,
          width: result.width,
          height: result.height,
          tags: [result.mode],
        })
        setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'done', mode: result.mode, record } : q)))
      } catch (error) {
        if (controller.signal.aborted) {
          setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'pending' } : q)))
          break
        }
        const message = error instanceof Error ? error.message : 'Failed'
        setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'failed', error: message } : q)))
      }
      doneBefore += 1
      // Yield to the browser so the progress bar stays alive on big batches.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    setProcessing(false)
    setProgressLabel('')
    setProgressPercent(0)
    abortRef.current = null
    void refreshVault()
  }, [queue, processing, modeChoice, tolerance, edgeChoke, edgeFeather, refreshVault])

  const cancelBatch = useCallback((): void => {
    abortRef.current?.abort()
  }, [])

  const removeQueued = useCallback((id: string): void => {
    setQueue((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const insertQueued = useCallback(
    async (item: QueueItem): Promise<void> => {
      if (!item.record) return
      try {
        await editor.insert.imageFiles([dataUrlToFile(item.record.dataUrl, item.name)])
      } catch {
        editor.toast('Could not insert the sticker', 'error')
      }
    },
    [editor],
  )

  /* ----------------------------------------------------------------- vault */

  const [vaultFilter, setVaultFilter] = useState('all')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [manualCategories, setManualCategories] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('nagar_sticker_vault_cats')
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('nagar_sticker_vault_cats', JSON.stringify(manualCategories))
    } catch {
      // Non-fatal: the pills just fall back to used categories.
    }
  }, [manualCategories])

  useEffect(() => {
    if (tab !== 'vault' || refine) return
    let active = true
    listStickers()
      .then((records) => {
        if (active) setStickers(records)
      })
      .catch(() => editor.toast('Could not read the sticker vault', 'error'))
    return () => {
      active = false
    }
  }, [tab, refine, editor])

  const categories = useMemo(() => {
    const all = new Set<string>(stickers.map((s) => s.category))
    for (const manual of manualCategories) all.add(manual)
    return [...all].sort((a, b) => a.localeCompare(b))
  }, [stickers, manualCategories])

  const visibleStickers = useMemo(
    () => (vaultFilter === 'all' ? stickers : stickers.filter((s) => s.category === vaultFilter)),
    [stickers, vaultFilter],
  )

  const renameSticker = useCallback(async (record: StickerRecord, name: string): Promise<void> => {
    const updated = await updateSticker(record.id, { name })
    if (updated) setStickers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }, [])

  const moveSticker = useCallback(async (record: StickerRecord, category: string): Promise<void> => {
    const updated = await updateSticker(record.id, { category })
    if (updated) setStickers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }, [])

  const removeSticker = useCallback(
    async (record: StickerRecord): Promise<void> => {
      try {
        await deleteSticker(record.id)
        setStickers((prev) => prev.filter((s) => s.id !== record.id))
      } catch {
        editor.toast('Could not delete the sticker', 'error')
      }
    },
    [editor],
  )

  const exportVaultFile = useCallback(async (): Promise<void> => {
    try {
      downloadJson(await exportVault())
      editor.toast('Vault exported · تم التصدير', 'success')
    } catch {
      editor.toast('Could not export the vault', 'error')
    }
  }, [editor])

  const importVaultFile = useCallback(
    async (file: File): Promise<void> => {
      try {
        const parsed = JSON.parse(await file.text()) as StickerVaultExport
        const imported = await importVault(parsed)
        await refreshVault()
        editor.toast(`Imported ${imported} stickers · تم الاستيراد`, 'success')
      } catch {
        editor.toast('Could not import the vault file', 'error')
      }
    },
    [editor, refreshVault],
  )

  const insertSticker = useCallback(
    async (record: StickerRecord): Promise<void> => {
      try {
        await editor.insert.imageFiles([dataUrlToFile(record.dataUrl, record.name)])
      } catch {
        editor.toast('Could not insert the sticker', 'error')
      }
    },
    [editor],
  )

  const dragSticker = useCallback((record: StickerRecord, event: React.DragEvent<HTMLDivElement>): void => {
    // Native file drag: the canvas drop target already inserts dropped image files,
    // and the inserted object keeps the full CutContour die-cut support.
    try {
      const file = dataUrlToFile(record.dataUrl, record.name)
      event.dataTransfer.items.add(file)
    } catch {
      // Some engines refuse programmatic file drags; click-to-insert still works.
    }
    event.dataTransfer.setData('text/plain', record.name)
    event.dataTransfer.effectAllowed = 'copy'
  }, [])

  /* ---------------------------------------------------------- refine handoff */

  const openRefine = useCallback(
    (file: File, meta?: { name: string; category: string }): void => {
      returnTabRef.current = tab
      setRefine({ file, category: meta?.category ?? relativeFolderOf(file) ?? 'عام' })
    },
    [tab],
  )

  /* ---------------------------------------------------------------- render */

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent): void => {
      if (event.key === 'Escape' && !refine) onClose()
    },
    [onClose, refine],
  )

  const doneCount = queue.filter((item) => item.status === 'done').length
  const failedCount = queue.filter((item) => item.status === 'failed').length

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Sticker Studio"
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      data-testid="sticker-studio-modal"
    >
      <div className={styles.modal} role="document">
        <div className={styles.header}>
          <h2 className={styles.title}>
            <Wand2 size={18} /> استوديو الستيكرز · Sticker Studio
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close" data-testid="studio-close">
            <X size={18} />
          </button>
        </div>

        {!refine && (
          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? styles.tabActive : ''} data-testid="studio-tab-create" onClick={() => setTab('create')}>
              إنشاء · Create
            </button>
            <button type="button" role="tab" aria-selected={tab === 'vault'} className={tab === 'vault' ? styles.tabActive : ''} data-testid="studio-tab-vault" onClick={() => setTab('vault')}>
              <Sparkles size={14} /> مكتبتي الخاصة · My Vault {stickers.length > 0 ? `(${stickers.length})` : ''}
            </button>
          </div>
        )}

        <div className={styles.body} data-testid="studio-body">
          {/* =============================================== REFINE */}
          {refine ? (
            <RefineCanvas
              file={refine.file}
              category={refine.category}
              defaults={{ mode: modeChoice, tolerance, edgeChoke, edgeFeather, borderPx, borderColor, borderShadow }}
              onClose={() => {
                setRefine(null)
                setTab(returnTabRef.current)
              }}
              onSaved={() => void refreshVault()}
            />
          ) : tab === 'create' ? (
            /* ============================================= CREATE */
            <div>
              <div
                className={dragOver ? styles.dropZoneActive : styles.dropZone}
                data-testid="studio-drop-zone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
                  if (files.length > 0) setQueue((prev) => [...prev, ...pendingFromFiles(files, null)])
                }}
              >
                <ImagePlus className={styles.dropIcon} size={26} />
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>ارفع صوراً ليقصها الاستوديو — pick images to cut out</div>
                <div className={styles.hint}>PNG · JPG · WEBP · GIF — إزالة خلفية بلا مفاتيح API</div>
              </div>

              <div className={styles.row} style={{ marginTop: 10 }}>
                <button type="button" className={styles.btn} data-testid="studio-import-folder" onClick={() => folderInputRef.current?.click()}>
                  <FolderOpen size={15} /> إضافة فولدر كامل (Import Folder)
                </button>
                <button type="button" className={styles.btn} onClick={() => fileInputRef.current?.click()}>
                  <Upload size={14} /> اختيار صور (Select files)
                </button>
                <span className={styles.hint}>فئة الفولدر = اسم الفولدر · the folder name becomes the category</span>
              </div>

              <div className={styles.modeRow} data-testid="studio-mode-row">
                {(
                  [
                    { id: 'auto', label: '🔍 تلقائي · Auto-detect' },
                    { id: 'neural', label: '🧠 ذكي · Neural AI' },
                    { id: 'studio', label: '⚡ استوديو · Studio' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={modeChoice === option.id ? styles.modePillActive : styles.modePill}
                    data-testid={`studio-mode-${option.id}`}
                    onClick={() => setModeChoice(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className={styles.controls}>
                <label className={styles.control}>
                  <span className={styles.controlLabel}>الفئة / Category <b>{categoryOverride.trim() || 'تلقائي · auto'}</b></span>
                  <input className={styles.textInput} value={categoryOverride} onChange={(e) => setCategoryOverride(e.target.value)} placeholder="رمضان / شعارات / ورود …" />
                </label>
                <label className={styles.control}>
                  <span className={styles.controlLabel}>تسامح القص / Tolerance <b>{tolerance}</b></span>
                  <input type="range" min={8} max={120} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
                </label>
                <label className={styles.control}>
                  <span className={styles.controlLabel}>انكماش الحافة / Edge choke <b>{edgeChoke}px</b></span>
                  <input type="range" min={-10} max={10} value={edgeChoke} onChange={(e) => setEdgeChoke(Number(e.target.value))} />
                </label>
                <label className={styles.control}>
                  <span className={styles.controlLabel}>نعومة الحافة / Feather <b>{edgeFeather}px</b></span>
                  <input type="range" min={0} max={10} value={edgeFeather} onChange={(e) => setEdgeFeather(Number(e.target.value))} />
                </label>
                <label className={styles.control}>
                  <span className={styles.controlLabel}>حد الديكات / Die-cut border <b>{borderPx}px</b></span>
                  <input type="range" min={0} max={24} value={borderPx} onChange={(e) => setBorderPx(Number(e.target.value))} />
                </label>
                <label className={styles.control}>
                  <span className={styles.controlLabel}>لون الحد / Border colour</span>
                  <span className={styles.row}>
                    <input type="color" className={styles.colorSwatch} value={borderColor} onChange={(e) => setBorderColor(e.target.value)} aria-label="Die-cut border colour" />
                    <label className={styles.hint}>
                      <input type="checkbox" checked={borderShadow} onChange={(e) => setBorderShadow(e.target.checked)} /> ظل · shadow
                    </label>
                  </span>
                </label>
              </div>

              {queue.length > 0 && (
                <div className={styles.sectionGap}>
                  <div className={styles.row}>
                    <button type="button" className={styles.btnPrimary} data-testid="studio-process" onClick={() => void runBatch()} disabled={processing}>
                      <Wand2 size={14} /> معالجة وحفظ ({queue.filter((item) => item.status === 'pending').length})
                    </button>
                    {processing ? (
                      <button type="button" className={styles.btn} data-testid="studio-cancel-batch" onClick={cancelBatch}>
                        <X size={14} /> إيقاف · Cancel
                      </button>
                    ) : (
                      <button type="button" className={styles.btn} onClick={() => setQueue([])}>
                        <Trash2 size={14} /> مسح · Clear
                      </button>
                    )}
                  </div>

                  <div className={styles.progressWrap}>
                    <div className={styles.progressLabel} data-testid="batch-progress">
                      {progressLabel || (processing ? '…' : `${queue.length} في القائمة · in queue`)}
                    </div>
                    <div className={styles.progressBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
                      <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className={styles.hint}>
                      {doneCount} تم · {failedCount} فشل — done / failed
                    </div>
                  </div>

                  <div className={styles.queue} data-testid="studio-queue">
                    {queue.map((item) => (
                      <div key={item.id} className={styles.queueItem} data-testid={`queue-item-${item.id}`}>
                        {item.record ? <img src={item.record.dataUrl} alt="" className={styles.queueThumb} /> : <span className={styles.queueThumb} />}
                        <span className={styles.queueName} title={item.error}>{item.name}</span>
                        <span className={styles.badge}>{item.category}</span>
                        {item.mode && <span className={styles.badge}>{item.mode}</span>}
                        <span className={`${styles.badge} ${item.status === 'done' ? styles.badgeDone : ''} ${item.status === 'working' ? styles.badgeWorking : ''} ${item.status === 'failed' ? styles.badgeFailed : ''}`} title={item.error}>
                          {item.status === 'done' ? '✓' : item.status === 'failed' ? '✕' : '…'}
                        </span>
                        {item.record && (
                          <button type="button" className={styles.iconBtn} title="Insert · إدراج" data-testid={`queue-insert-${item.id}`} onClick={() => void insertQueued(item)}>
                            <ImagePlus size={15} />
                          </button>
                        )}
                        {!item.record && !processing && (
                          <>
                            <button type="button" className={styles.iconBtn} title="Refine in studio · فتح في الاستوديو" onClick={() => openRefine(item.file, { name: item.name, category: item.category })}>
                              <Pencil size={14} />
                            </button>
                            <button type="button" className={styles.iconBtn} title="Remove" onClick={() => removeQueued(item.id)}>
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ================================================ VAULT */
            <div data-testid="studio-vault">
              <div className={styles.row}>
                <button type="button" className={styles.btn} data-testid="vault-export" onClick={() => void exportVaultFile()}>
                  <Download size={14} /> تصدير · Export
                </button>
                <button type="button" className={styles.btn} data-testid="vault-import" onClick={() => importInputRef.current?.click()}>
                  <Upload size={14} /> استيراد · Import
                </button>
                <span className={styles.hint}>{stickers.length} ستيكر · stickers</span>
              </div>

              <div className={styles.pills} role="tablist" aria-label="Vault categories">
                <button type="button" role="tab" aria-selected={vaultFilter === 'all'} className={vaultFilter === 'all' ? styles.pillActive : styles.pill} onClick={() => setVaultFilter('all')}>
                  الكل · All
                </button>
                {categories.map((cat) => (
                  <button key={cat} type="button" role="tab" aria-selected={vaultFilter === cat} className={vaultFilter === cat ? styles.pillActive : styles.pill} data-testid={`vault-pill-${cat}`} onClick={() => setVaultFilter(cat)}>
                    {cat}
                  </button>
                ))}
                <span className={styles.row}>
                  <input
                    className={styles.textInput}
                    style={{ height: 26, width: 110, fontSize: 11.5 }}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="فئة جديدة…"
                    aria-label="New category"
                  />
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Create category"
                    onClick={() => {
                      const value = newCategory.trim()
                      if (!value) return
                      setManualCategories((prev) => (prev.includes(value) ? prev : [...prev, value]))
                      setVaultFilter(value)
                      setNewCategory('')
                    }}
                  >
                    +
                  </button>
                </span>
              </div>

              {visibleStickers.length === 0 ? (
                <div className={styles.emptyVault} data-testid="vault-empty">
                  المكتبة فاضية — أنشئ ستيكرات من تبويب «إنشاء».
                  <br />No stickers yet — create some from the Create tab.
                </div>
              ) : (
                <div className={styles.vaultGrid} data-testid="vault-grid">
                  {visibleStickers.map((record) => (
                    <div key={record.id} className={styles.vaultItem} data-testid={`vault-item-${record.id}`} draggable onDragStart={(e) => dragSticker(record, e)}>
                      <img
                        src={record.dataUrl}
                        alt={record.name}
                        className={styles.vaultThumb}
                        title={`${record.name} — click to insert`}
                        onClick={() => void insertSticker(record)}
                      />
                      {renamingId === record.id ? (
                        <input
                          className={styles.vaultNameInput}
                          defaultValue={record.name}
                          autoFocus
                          data-testid={`vault-rename-${record.id}`}
                          onBlur={(e) => {
                            void renameSticker(record, e.target.value)
                            setRenamingId(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              void renameSticker(record, (e.target as HTMLInputElement).value)
                              setRenamingId(null)
                            }
                          }}
                        />
                      ) : (
                        <input className={styles.vaultName} value={record.name} readOnly title={record.name} onFocus={() => setRenamingId(record.id)} />
                      )}
                      <select
                        className={styles.categorySelect}
                        value={record.category}
                        aria-label="Category"
                        onChange={(e) => void moveSticker(record, e.target.value)}
                      >
                        {[...new Set([...categories, record.category])].map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      <div className={styles.vaultItemActions}>
                        <button type="button" className={styles.iconBtn} title="Rename · إعادة تسمية" onClick={() => setRenamingId(record.id)}>
                          <Pencil size={13} />
                        </button>
                        <button type="button" className={styles.iconBtn} title="Delete · حذف" data-testid={`vault-delete-${record.id}`} onClick={() => void removeSticker(record)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hidden pickers: the folder input is what makes "إضافة فولدر كامل" work. */}
        <input
          ref={(el) => {
            if (el) {
              el.setAttribute('webkitdirectory', '')
              el.setAttribute('directory', '')
            }
          }}
          type="file"
          multiple
          accept="image/*"
          hidden
          onChange={(e) => {
            onPickFiles(e.target.files, true)
            e.target.value = ''
          }}
          data-testid="studio-folder-input"
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          hidden
          onChange={(e) => {
            onPickFiles(e.target.files, false)
            e.target.value = ''
          }}
        />
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importVaultFile(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
