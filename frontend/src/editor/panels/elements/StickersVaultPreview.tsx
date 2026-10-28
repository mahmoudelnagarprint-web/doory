/**
 * "مكتبتي الخاصة / My Stickers" — the custom-vault preview row of the Stickers tab.
 *
 * Shows the newest custom stickers plus the entry buttons, supports click-to-insert and native
 * file drag onto the canvas (inserted stickers keep the full CutContour die-cut support). Refreshes
 * itself whenever the sticker-studio dialog closes, so new saves appear immediately.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Layers, Sparkles } from 'lucide-react'
import { useEditor, useEditorState } from '../../context'
import { listStickers, type StickerRecord } from '@/lib/storage/stickerVault'
import styles from './ElementsPanel.module.css'

export interface StickersVaultPreviewProps {
  className?: string
}

export function StickersVaultPreview(_props: StickersVaultPreviewProps) {
  const editor = useEditor()
  const dialog = useEditorState((s) => s.ui.dialog)
  const [records, setRecords] = useState<StickerRecord[]>([])
  const studioWasOpen = useRef(false)

  const reload = useCallback((): void => {
    void listStickers()
      .then((all) => setRecords(all.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 8)))
      .catch(() => undefined)
  }, [])

  useEffect(() => { reload() }, [reload])

  // After the studio closes, show what was saved in it.
  useEffect(() => {
    if (dialog?.id === 'sticker-studio') studioWasOpen.current = true
    else if (studioWasOpen.current) {
      studioWasOpen.current = false
      reload()
    }
  }, [dialog, reload])

  const insert = useCallback(
    async (record: StickerRecord): Promise<void> => {
      try {
        const blob = await (await fetch(record.dataUrl)).blob()
        await editor.insert.imageFiles([new File([blob], `${record.name}.png`, { type: 'image/png' })])
      } catch {
        editor.toast('Could not insert sticker', 'error')
      }
    },
    [editor],
  )

  const onDragStart = useCallback((record: StickerRecord, e: React.DragEvent<HTMLDivElement>): void => {
    const comma = record.dataUrl.indexOf(',')
    const binary = atob(record.dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    try {
      e.dataTransfer.items.add(new File([bytes], `${record.name}.png`, { type: 'image/png' }))
    } catch {
      // Some engines refuse programmatic file drags.
    }
    e.dataTransfer.setData('text/plain', record.name)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  return (
    <div style={{ marginBottom: 16 }} data-testid="my-stickers">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>مكتبتي الخاصة · My Stickers {records.length > 0 ? `(${records.length}+)` : ''}</h4>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className={styles.actionBtn} data-testid="open-sticker-studio" onClick={() => editor.openDialog('sticker-studio', { start: 'create' })}>
            <Sparkles size={13} /> إنشاء ستيكر (Create)
          </button>
          <button type="button" className={styles.actionBtn} data-testid="open-sticker-vault" onClick={() => editor.openDialog('sticker-studio', { start: 'vault' })}>
            <Layers size={13} /> المكتبة (Vault)
          </button>
        </div>
      </div>
      {records.length > 0 && (
        <div className={styles.carousel} data-testid="vault-carousel">
          {records.map((record) => (
            <div
              key={record.id}
              className={styles.carouselItem}
              draggable
              title={`${record.name} — ${record.category} (click to insert)`}
              data-testid={`vault-thumb-${record.id}`}
              onDragStart={(e) => onDragStart(record, e)}
              onClick={() => void insert(record)}
            >
              <img
                src={record.dataUrl}
                alt={record.name}
                style={{
                  width: 56,
                  height: 56,
                  objectFit: 'contain',
                  borderRadius: 6,
                  background: 'repeating-conic-gradient(var(--ed-border) 0% 25%, var(--ed-surface-2) 0% 50%) 0 0 / 10px 10px',
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
