import { describe, expect, test } from 'vitest'
import { classifyRegion, type ClassifyFeatures } from './classify'
import type { LayerClass } from './types'

const base: ClassifyFeatures = {
  bounds: { x: 10, y: 10, width: 20, height: 20 },
  areaFraction: 0.1,
  aspect: 1,
  fillRatio: 0.6,
  touchesBorder: false,
  meanColor: { r: 40, g: 80, b: 160 },
  textCandidate: false,
  contrastAgainstBackground: 90,
}

const features = (overrides: Partial<ClassifyFeatures>): ClassifyFeatures => ({ ...base, ...overrides })

interface Case {
  name: string
  features: ClassifyFeatures
  expected: LayerClass
}

/** Table-driven over the documented rule set in classify.ts. */
const CASES: Case[] = [
  {
    name: 'page sized border region with no contrast is the background',
    features: features({ areaFraction: 0.92, touchesBorder: true, contrastAgainstBackground: 6, fillRatio: 1, aspect: 1.4 }),
    expected: 'background',
  },
  {
    name: 'wide ink band is text',
    features: features({ textCandidate: true, aspect: 6, fillRatio: 0.4, areaFraction: 0.04, contrastAgainstBackground: 80 }),
    expected: 'text',
  },
  {
    name: 'tall ink band is text',
    features: features({ textCandidate: true, aspect: 0.15, fillRatio: 0.4, areaFraction: 0.04, contrastAgainstBackground: 80 }),
    expected: 'text',
  },
  {
    name: 'small, very high contrast blob is a sticker',
    features: features({ areaFraction: 0.01, contrastAgainstBackground: 120, fillRatio: 0.8, aspect: 1 }),
    expected: 'sticker',
  },
  {
    name: 'small high contrast non-blob ornament is decoration',
    features: features({ areaFraction: 0.01, contrastAgainstBackground: 80, fillRatio: 0.3, aspect: 1 }),
    expected: 'decoration',
  },
  {
    name: 'large interior block with a solid fill is a photo',
    features: features({ areaFraction: 0.3, fillRatio: 0.7, aspect: 1.5, contrastAgainstBackground: 90 }),
    expected: 'photo',
  },
  {
    name: 'thin strokes are a logo',
    features: features({ fillRatio: 0.1, textCandidate: true, areaFraction: 0.05, aspect: 1.5, contrastAgainstBackground: 120 }),
    expected: 'logo',
  },
  {
    name: 'no rule matches a mid sized, mid filled, low contrast region',
    features: features({ areaFraction: 0.06, fillRatio: 0.5, contrastAgainstBackground: 30 }),
    expected: 'unknown',
  },
  {
    name: 'a border region too small to be the background is unknown',
    features: features({ areaFraction: 0.2, fillRatio: 0.6, touchesBorder: true, contrastAgainstBackground: 40 }),
    expected: 'unknown',
  },
  {
    name: 'a small but barely visible region is unknown',
    features: features({ areaFraction: 0.01, fillRatio: 0.8, contrastAgainstBackground: 20 }),
    expected: 'unknown',
  },
]

describe('classifyRegion', () => {
  for (const testCase of CASES) {
    test(testCase.name, () => {
      const result = classifyRegion(testCase.features)
      expect(result.layerClass).toBe(testCase.expected)
      if (testCase.expected === 'unknown') {
        expect(result.confidence).toBeLessThanOrEqual(0.2)
      } else {
        expect(result.confidence).toBeGreaterThan(0.3)
      }
    })
  }

  test('confidence is earned, not a constant', () => {
    const confidences = CASES.map((testCase) => classifyRegion(testCase.features).confidence)
    expect(new Set(confidences).size).toBeGreaterThan(3)
    for (const confidence of confidences) {
      expect(confidence).toBeGreaterThanOrEqual(0.1)
      expect(confidence).toBeLessThanOrEqual(0.95)
    }
  })

  test('several agreeing rules beat a contested win', () => {
    const cleanPhoto = classifyRegion(features({ areaFraction: 0.3, fillRatio: 0.7, aspect: 1.5, contrastAgainstBackground: 90 }))
    const contestedText = classifyRegion(
      features({ textCandidate: true, aspect: 6, fillRatio: 0.4, areaFraction: 0.3, contrastAgainstBackground: 90 }),
    )
    expect(cleanPhoto.layerClass).toBe('photo')
    expect(contestedText.layerClass).toBe('text')
    expect(cleanPhoto.confidence).toBeGreaterThan(contestedText.confidence)
  })

  test('never invents a class it has no rule for', () => {
    const classes = new Set(CASES.map((testCase) => classifyRegion(testCase.features).layerClass))
    for (const layerClass of classes) {
      expect(['background', 'text', 'sticker', 'decoration', 'photo', 'logo', 'unknown']).toContain(layerClass)
    }
    // No rule can prove these from geometry and colour alone.
    for (const unprovable of ['person', 'frame', 'shape', 'shadow', 'other'] as LayerClass[]) {
      expect(classes.has(unprovable)).toBe(false)
    }
  })
})
