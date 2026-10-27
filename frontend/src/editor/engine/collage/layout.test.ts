import type { CollageBounds, CollageLayoutId } from '@/types/document'
import { COLLAGE_LAYOUTS, defaultCollageGap, defaultCollageMargin, defaultCollageStyle, resolveLayout } from './layout'

const bounds: CollageBounds = { x: 0, y: 0, width: 559, height: 794 }

describe('collage layout solver', () => {
  it('has a default frame that scales with the page', () => {
    const small = defaultCollageStyle({ width: 559, height: 794 })
    const large = defaultCollageStyle({ width: 1080, height: 1080 })
    expect(small.outerColor).toBe('#d4af37')
    expect(small.matWidth).toBeLessThan(large.matWidth)
    expect(defaultCollageMargin({ width: 559, height: 794 })).toBe(34)
    expect(defaultCollageGap({ width: 559, height: 794 })).toBe(10)
  })

  it('solves every template for every supported slot count inside its bounds', () => {
    for (const layout of COLLAGE_LAYOUTS) {
      for (let count = 1; count <= 12; count++) {
        const frames = resolveLayout(layout, count, bounds, 10, 30, false)
        expect(frames).toHaveLength(count)
        for (const frame of frames) {
          expect(frame.width).toBeGreaterThan(0)
          expect(frame.height).toBeGreaterThan(0)
          expect(frame.cx - frame.width / 2).toBeGreaterThanOrEqual(30 - 0.001)
          expect(frame.cy - frame.height / 2).toBeGreaterThanOrEqual(30 - 0.001)
          expect(frame.cx + frame.width / 2).toBeLessThanOrEqual(bounds.width - 30 + 0.001)
          expect(frame.cy + frame.height / 2).toBeLessThanOrEqual(bounds.height - 30 + 0.001)
        }
      }
    }
  })

  it('centres a single slot when the template has one picture', () => {
    for (const layout of COLLAGE_LAYOUTS) {
      const [frame] = resolveLayout(layout, 1, bounds, 10, 30, false)
      expect(frame.cx).toBeCloseTo(bounds.width / 2)
      expect(frame.cy).toBeCloseTo(bounds.height / 2)
      if (layout !== 'polaroid') {
        expect(frame.width).toBeCloseTo(bounds.width - 60)
        expect(frame.height).toBeCloseTo(bounds.height - 60)
      }
    }
  })

  it('mirrors the reading order for a right-to-left collage', () => {
    const ltr = resolveLayout('grid', 2, bounds, 10, 30, false)
    const rtl = resolveLayout('grid', 2, bounds, 10, 30, true)
    expect(ltr[0].cx).toBeLessThan(ltr[1].cx)
    expect(rtl[0].cx).toBeGreaterThan(rtl[1].cx)
    expect(rtl[0].cx).toBeCloseTo(bounds.width - ltr[0].cx)
  })

  it('makes the hero first slot larger than the rest', () => {
    const [hero, ...rest] = resolveLayout('hero', 5, bounds, 10, 30, false)
    expect(hero.width).toBeGreaterThan(rest[0].width)
    expect(hero.height).toBeGreaterThan(rest[0].height)
  })

  it('keeps the mosaic feature larger than its side slots', () => {
    const [feature, under, side] = resolveLayout('mosaic', 4, bounds, 10, 30, false)
    expect(feature.width).toBeGreaterThan(side.width)
    expect(feature.height).toBeGreaterThan(side.height)
    expect(under.width).toBeCloseTo(feature.width)
  })

  it('gives the polaroid template a gentle alternating tilt', () => {
    const frames = resolveLayout('polaroid', 4, bounds, 10, 30, false)
    expect(frames[0].angle).toBeLessThan(0)
    expect(frames[1].angle).toBeGreaterThan(0)
    expect(frames[0].width).toBeLessThan(resolveLayout('grid', 4, bounds, 10, 30, false)[0].width)
  })

  it('clamps an impossible gap instead of producing negative cells', () => {
    const frames = resolveLayout('grid', 4, { x: 0, y: 0, width: 40, height: 40 }, 500, 0, false)
    for (const frame of frames) {
      expect(frame.width).toBeGreaterThan(0)
      expect(frame.height).toBeGreaterThan(0)
    }
  })

  it('recognises every layout id', () => {
    const ids: CollageLayoutId[] = [...COLLAGE_LAYOUTS]
    expect(new Set(ids).size).toBe(ids.length)
  })
})
