import { type ReactNode, useRef, useState } from 'react'
import { type FillSpec } from '../engine/objects/fills'
import { fillCssPreview } from '../engine/objects/fills'
import { loadable } from './loadable'
import { Popover } from './Popover'
import { Tooltip } from './Tooltip'
import styles from './ColorButton.module.css'

/** Only needed once the popover opens, so it is downloaded on hover/focus of the button (see `preload`). */
const FillEditor = loadable(() => import('./FillEditor').then((m) => m.FillEditor), { fallback: null })
const ColorPicker = loadable(() => import('./ColorPicker').then((m) => m.ColorPicker), { fallback: null })

interface ColorButtonProps {
  label: string
  value: FillSpec
  onChange: (fill: FillSpec) => void
  solidOnly?: boolean
  /** `swatch` is a round chip; `bar` shows an icon with a colour underline (text colour). */
  variant?: 'swatch' | 'bar' | 'chip'
  icon?: ReactNode
  extraSwatches?: { label: string; colors: readonly string[] }
  /** Show a "none" state (transparent). */
  none?: boolean
  disabled?: boolean
  className?: string
}

/** Colour control: shows the current fill and opens the picker / gradient editor in a popover. */
export function ColorButton({ label, value, onChange, solidOnly, variant = 'swatch', icon, extraSwatches, none, disabled, className }: ColorButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const bg = fillCssPreview(value)
  const preload = () => Promise.all([FillEditor.preload(), ColorPicker.preload()])
  return (
    <>
      <Tooltip label={label}>
        <button
          ref={ref}
          type="button"
          className={`${styles.btn} ${styles[variant]} ${none ? styles.none : ''} ${className ?? ''}`}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onPointerEnter={() => void preload()}
          onFocus={() => void preload()}
          onClick={() => setOpen((o) => !o)}
        >
          {variant === 'bar' ? (
            <>
              <span className={styles.glyph}>{icon}</span>
              <span className={styles.underline} style={{ background: bg }} />
            </>
          ) : (
            <span className={styles.chip} style={{ background: none ? undefined : bg }} />
          )}
        </button>
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} label={label} placement="bottom-start">
        {solidOnly && value.type === 'solid' ? <ColorPicker value={value.color} onChange={(color) => onChange({ type: 'solid', color })} extraSwatches={extraSwatches} /> : <FillEditor value={value} onChange={onChange} solidOnly={solidOnly} extraSwatches={extraSwatches} />}
      </Popover>
    </>
  )
}
