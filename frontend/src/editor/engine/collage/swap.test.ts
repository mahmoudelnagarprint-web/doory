import type { SlotSpec } from '@/types/document'
import { frameOverlap, slotBox, swapTarget } from './swap'

const slot = (patch: Partial<SlotSpec> = {}): SlotSpec => ({ cx: 50, cy: 50, width: 100, height: 100, angle: 0, ...patch })

describe('slot swapping on drop', () => {
  it('measures how much of the dragged frame covers another', () => {
    expect(frameOverlap(slot(), slot())).toBe(1)
    expect(frameOverlap(slot(), slot({ cx: 100 }))).toBeCloseTo(0.5)
    expect(frameOverlap(slot(), slot({ cx: 160 }))).toBe(0)
    expect(frameOverlap(slot({ width: 0 }), slot())).toBe(0)
  })

  it('uses the bounding box of a tilted frame', () => {
    const box = slotBox(slot({ angle: 45 }))
    expect(box.width).toBeCloseTo(Math.SQRT2 * 100)
    expect(box.left).toBeCloseTo(50 - Math.SQRT2 * 50)
  })

  it('picks the most covered other slot once half the frame is over it', () => {
    const source = { id: 'a', slot: slot() }
    const near = { id: 'b', slot: slot({ cx: 80 }) } // 70 % overlap
    const far = { id: 'c', slot: slot({ cx: 120 }) } // 30 %
    expect(swapTarget(source, [source, far, near])?.id).toBe('b')
    expect(swapTarget(source, [source, far])).toBeUndefined()
    expect(swapTarget(source, [near], 0.8)).toBeUndefined()
  })
})
