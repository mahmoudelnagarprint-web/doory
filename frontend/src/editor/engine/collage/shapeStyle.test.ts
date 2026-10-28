import { SLOT_SHAPES, slotClipStyle } from './shapeStyle'

describe('slotClipStyle', () => {
  it('leaves a rectangle unclipped', () => {
    expect(slotClipStyle(null, 40, 20)).toEqual({})
    expect(SLOT_SHAPES[0]).toBeNull()
  })

  it('draws the primitives with border-radius', () => {
    expect(slotClipStyle('rounded', 40, 20, 0.2)).toEqual({ borderRadius: '4px' })
    expect(slotClipStyle('circle', 40, 20)).toEqual({ borderRadius: '50%' })
    expect(slotClipStyle('arch', 40, 20).borderRadius).toContain('50% 50% 0 0')
  })

  it('draws the polygon shapes with clip-path', () => {
    expect(slotClipStyle('triangle', 40, 20).clipPath?.startsWith('polygon(')).toBe(true)
    expect(slotClipStyle('diamond', 40, 20).clipPath).toContain('50% 2%')
    expect(slotClipStyle('hexagon', 40, 20).clipPath).toContain('98% 50%')
    expect(slotClipStyle('cross', 40, 20).clipPath?.split(',').length).toBe(12)
    // Five tips and five inner corners.
    expect(slotClipStyle('star', 40, 20).clipPath?.split(',').length).toBe(10)
  })

  it('falls back to a soft frame for custom paths and heart shapes', () => {
    expect(slotClipStyle({ path: 'M0 0 H100 V100 Z' }, 40, 20, 0.25)).toEqual({ borderRadius: '5px' })
    expect(slotClipStyle('heart', 40, 20, 0.5)).toEqual({ borderRadius: '10px' })
  })
})
