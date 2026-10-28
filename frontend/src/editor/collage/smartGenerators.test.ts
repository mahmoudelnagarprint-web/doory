import type { CollageFrameSpec } from '@/types/document'
import {
  COLLAGE_CATEGORIES,
  COLLAGE_MAX_COUNT,
  COLLAGE_PRESETS,
  bspFrames,
  generateProcedural,
  goldenSpiralFrames,
  justifiedFrames,
  presetsFor,
} from './smartGenerators'

/**
 * Checks the requested number of frames, each with area, sitting inside the page. Collected into one
 * assertion: this runs for every category, photo count and preset (~35k checks), and one `expect` per
 * check would push the suite past its timeout.
 */
function expectInside(frames: readonly CollageFrameSpec[], count: number): void {
  const problems: string[] = []
  if (frames.length !== count) problems.push(`expected ${count} frames, got ${frames.length}`)
  for (const [i, frame] of frames.entries()) {
    if (!(frame.width > 0) || !(frame.height > 0)) problems.push(`frame ${i} has no area`)
    if (frame.x < 0 || frame.y < 0) problems.push(`frame ${i} starts outside the page`)
    if (frame.x + frame.width > 1.001 || frame.y + frame.height > 1.001) problems.push(`frame ${i} overflows the page`)
  }
  expect(problems).toEqual([])
}

describe('smart collage generators', () => {
  it('offers eight categories and more than 250 presets', () => {
    expect(COLLAGE_CATEGORIES).toHaveLength(8)
    expect(COLLAGE_PRESETS.length).toBeGreaterThanOrEqual(250)
    expect(new Set(COLLAGE_PRESETS.map((preset) => preset.id)).size).toBe(COLLAGE_PRESETS.length)
  })

  it('has a usable layout for every category and every photo count', () => {
    for (const category of COLLAGE_CATEGORIES) {
      for (let count = 1; count <= COLLAGE_MAX_COUNT; count++) {
        const presets = presetsFor(category.id, count)
        expect(presets).toHaveLength(5)
        for (const preset of presets) expectInside(preset.frames, count)
      }
    }
  })

  it('is deterministic for a seed and different for another seed', () => {
    const first = generateProcedural(12345, 9, 'bsp')
    const again = generateProcedural(12345, 9, 'bsp')
    const other = generateProcedural(54321, 9, 'bsp')
    expect(again).toEqual(first)
    expect(other).not.toEqual(first)
    expectInside(first, 9)
  })

  it('builds exactly the requested number of BSP rectangles', () => {
    for (let count = 1; count <= COLLAGE_MAX_COUNT; count++) {
      expectInside(bspFrames(count, 900 + count, 0.014, false), count)
      expectInside(bspFrames(count, 1900 + count, 0.014, true), count)
    }
  })

  it('peels a golden spiral without leaving the page', () => {
    for (let count = 1; count <= COLLAGE_MAX_COUNT; count++) {
      expectInside(goldenSpiralFrames(count, 77 + count), count)
    }
  })

  it('packs justified rows from the photo aspect ratios', () => {
    const aspects = [1.5, 1, 0.75, 2, 1.333, 1.6, 1.2, 0.8]
    const frames = justifiedFrames(aspects, 1.4)
    expectInside(frames, aspects.length)

    // Every row is flush with both page edges: the frame widths plus gutters add up to one.
    const rows = new Map<number, CollageFrameSpec[]>()
    for (const frame of frames) {
      const key = Math.round(frame.y * 1000)
      rows.set(key, [...(rows.get(key) ?? []), frame])
    }
    for (const row of rows.values()) {
      const last = row[row.length - 1]
      expect(last.x + last.width).toBeCloseTo(1, 2)
    }

    // The aspect ratio of each photo survives the row solve. Frames are normalised to the page, so
    // the physical ratio is (width / height) / pageAspect, where 1.4 is the container aspect.
    const sorted = [...frames].sort((a, b) => a.y - b.y || a.x - b.x)
    sorted.forEach((frame, index) => {
      expect(frame.width / frame.height / 1.4).toBeCloseTo(aspects[index] ?? 1, 1)
    })
  })

  it('chooses a recipe from the seed in auto mode', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const frames = generateProcedural(seed, 6)
      expectInside(frames, 6)
      expect(frames).toEqual(generateProcedural(seed, 6))
    }
  })
})
