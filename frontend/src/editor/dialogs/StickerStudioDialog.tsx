/**
 * Dialog adapter for the AI Sticker Studio: lets anything that can open a dialog (`editor.openDialog`)
 * — the right-click menu, the sticker panel, a quick action — show the studio without each host
 * mounting its own copy. The heavy component stays in its own chunk (see `DialogHost`).
 */

import type { ReactNode } from 'react'
import { useEditor } from '../context'
import { StickerStudioModal } from '../panels/elements/StickerStudioModal'
import type { StickerStudioModalProps } from '../panels/elements/StickerStudioModal'

export interface StickerStudioDialogProps {
  props?: Record<string, unknown>
}

export function StickerStudioDialog({ props }: StickerStudioDialogProps): ReactNode {
  const editor = useEditor()
  const start: StickerStudioModalProps['start'] = props?.start === 'vault' ? 'vault' : 'create'
  const initialFile = props?.initialFile instanceof File ? props.initialFile : null
  return <StickerStudioModal start={start} initialFile={initialFile} onClose={() => editor.closeDialog()} />
}
