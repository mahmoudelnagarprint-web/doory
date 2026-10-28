import type { Rgba } from '../engine/colors'
import { parseColor } from '../engine/colors'
import { buildThemes, quantize, textColorOf, themesFromPhotos } from './palette'

const pixel = (r: number, g: number, b: number, a = 1): Rgba => ({ r, g, b, a })

describe('photo palette', () => {
  it('quantizes the most common colours and drops transparent or extreme pixels', () => {
    const colors = quantize([
      pixel(200, 40, 40),
      pixel(202, 42, 41),
      pixel(200, 40, 40),
      pixel(255, 255, 255),
      pixel(2, 2, 2),
      pixel(0, 0, 0, 0),
      pixel(30, 120, 180),
      pixel(31, 121, 181),
    ], 4)

    expect(colors.length).toBeLessThanOrEqual(4)
    // The red bucket has three pixels, the blue one two.
    expect(colors[0].r).toBeGreaterThan(150)
    expect(colors[0].g).toBeLessThan(80)
    expect(colors.some((color) => color.b > 150)).toBe(true)
    expect(colors.every((color) => color.r < 250 || color.g < 250 || color.b < 250)).toBe(true)
  })

  it('builds five harmonious themes from a sampled photo', () => {
    const themes = buildThemes([pixel(190, 90, 60), pixel(230, 180, 120), pixel(60, 70, 90)])
    expect(themes).toHaveLength(5)
    expect(new Set(themes.map((theme) => theme.id)).size).toBe(5)
    for (const theme of themes) {
      expect(theme.swatches.length).toBeGreaterThanOrEqual(3)
      expect(parseColor(theme.text)).not.toBeNull()
      expect(theme.style.matColor && parseColor(theme.style.matColor)).toBeTruthy()
      expect(theme.style.outerColor && parseColor(theme.style.outerColor)).toBeTruthy()
      if (theme.background.type === 'gradient') {
        expect(theme.background.stops.length).toBeGreaterThanOrEqual(2)
        for (const stop of theme.background.stops) expect(parseColor(stop.color)).not.toBeNull()
      } else if (theme.background.type === 'solid') {
        expect(parseColor(theme.background.color)).not.toBeNull()
      }
    }
  })

  it('keeps the warm mat and gold rings in the first theme', () => {
    const [warm] = buildThemes([pixel(100, 140, 200)])
    expect(warm.style.innerColor).toBe('#d4af37')
    expect(parseColor(warm.style.matColor ?? '')).not.toBeNull()
    expect(warm.name).toBe('Warm mat')
  })

  it('falls back to the warm defaults when there are no photos', async () => {
    const themes = await themesFromPhotos([])
    expect(themes).toHaveLength(5)
    expect(themes[0].id).toBe('warm')
  })

  it('picks black or white for text on a colour', () => {
    expect(textColorOf('#ffffff')).toBe('#000000')
    expect(textColorOf('#101010')).toBe('#ffffff')
  })
})
