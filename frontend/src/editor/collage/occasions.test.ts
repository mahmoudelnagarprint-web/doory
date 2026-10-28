import { OCCASION_KITS, occasionFrames, occasionKit } from './occasions'
import { parseColor } from '../engine/colors'

describe('occasion starter kits', () => {
  it('ships the seven requested occasions', () => {
    expect(OCCASION_KITS.map((kit) => kit.id)).toEqual([
      'birthday',
      'wedding',
      'baby',
      'graduation',
      'travel',
      'ramadan',
      'memorial',
    ])
    expect(new Set(OCCASION_KITS.map((kit) => kit.id)).size).toBe(7)
  })

  it('gives every kit a layout, background, frame colours, a bilingual title and vector stickers', () => {
    for (const kit of OCCASION_KITS) {
      expect(kit.frames).toHaveLength(4)
      for (const frame of kit.frames) {
        expect(frame.width).toBeGreaterThan(0)
        expect(frame.height).toBeGreaterThan(0)
        expect(frame.x).toBeGreaterThanOrEqual(0)
        expect(frame.y).toBeGreaterThanOrEqual(0)
        expect(frame.x + frame.width).toBeLessThanOrEqual(1.001)
        expect(frame.y + frame.height).toBeLessThanOrEqual(1.001)
      }
      expect(kit.titleAr.length).toBeGreaterThan(0)
      expect(kit.titleEn.length).toBeGreaterThan(0)
      expect(parseColor(kit.accent)).not.toBeNull()
      expect(parseColor(kit.badgeColor)).not.toBeNull()
      expect(parseColor(kit.textColor)).not.toBeNull()
      expect(kit.stickers.length).toBeGreaterThan(0)
      for (const sticker of kit.stickers) {
        expect(sticker.svg.startsWith('<svg')).toBe(true)
        expect(sticker.svg.endsWith('</svg>')).toBe(true)
        expect(sticker.svg).toContain('viewBox="0 0 100 100"')
        expect(sticker.size).toBeGreaterThan(0)
      }
    }
  })

  it('adapts a kit to any photo count without leaving the page', () => {
    for (const kit of OCCASION_KITS) {
      for (let count = 1; count <= 16; count++) {
        const frames = occasionFrames(kit, count)
        expect(frames).toHaveLength(count)
        for (const frame of frames) {
          expect(frame.x + frame.width).toBeLessThanOrEqual(1.001)
          expect(frame.y + frame.height).toBeLessThanOrEqual(1.001)
        }
      }
    }
  })

  it('looks a kit up by id and returns a copy of its frames', () => {
    const kit = occasionKit('wedding')
    expect(kit?.label).toBe('Wedding')
    const frames = occasionFrames(kit!, 4)
    expect(frames).toEqual(kit!.frames)
    frames[0].x = 0.9
    expect(kit!.frames[0].x).not.toBe(0.9)
    expect(occasionKit('nope' as never)).toBeUndefined()
  })
})
