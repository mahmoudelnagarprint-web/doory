import { useState } from 'react'
import { Scissors } from 'lucide-react'
import { useEditor } from '../../context'
import { CutLineError, DEFAULT_CUT_LINE_OFFSET_MM } from '../../engine/api/cutline'
import { t } from '../../strings'
import { NumberField } from '../../ui/NumberField'
import { CUT_LINE_OFFSET, rangeHint } from '../limits'
import { PopoverStack, PopoverTool } from '../parts'
import ed from '../../chrome/ed.module.css'
import styles from './sections.module.css'

/** One image or SVG: a bleed control and a button that traces its visible edge. */
export function CutLineSection() {
  const editor = useEditor()
  const [offset, setOffset] = useState(DEFAULT_CUT_LINE_OFFSET_MM)
  const [busy, setBusy] = useState(false)

  const generate = async (close: () => void): Promise<void> => {
    setBusy(true)
    try {
      if (await editor.cutline.generate(offset)) close()
    } catch (err) {
      editor.toast(err instanceof CutLineError && err.code === 'empty' ? t.errors.cutLineEmpty : t.errors.cutLineFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PopoverTool
      label={t.toolbar.cutLine}
      trigger={
        <>
          <Scissors size={18} aria-hidden="true" />
          <span className={ed.toolText}>{t.toolbar.cutLine}</span>
        </>
      }
      width={280}
      testId="ed-cutline"
    >
      {(close) => (
        <PopoverStack width={248}>
          <NumberField
            label={t.toolbar.cutLineOffset}
            value={offset}
            onChange={setOffset}
            min={CUT_LINE_OFFSET.min}
            max={CUT_LINE_OFFSET.max}
            step={CUT_LINE_OFFSET.step}
            decimals={CUT_LINE_OFFSET.decimals}
            suffix="mm"
            hint={rangeHint(CUT_LINE_OFFSET, 'mm')}
            showLabel
          />
          <p className={ed.hintText}>{t.toolbar.cutLineHint}</p>
          <div className={styles.wideTool}>
            <button type="button" className={`${ed.btn} ${ed.primary}`} disabled={busy} data-testid="ed-cutline-generate" onClick={() => void generate(close)}>
              {busy ? t.toolbar.cutLineWorking : t.toolbar.cutLineGenerate}
            </button>
          </div>
        </PopoverStack>
      )}
    </PopoverTool>
  )
}
