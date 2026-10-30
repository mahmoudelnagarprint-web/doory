/**
 * Design Decomposer — layer classification.
 *
 * A small, honest rule engine over measured region features. Every rule states a documentable
 * heuristic; a class only wins when its rules carry the most weight, and `unknown` is returned when no
 * rule fires — the module never guesses a semantic name for evidence it does not have (there is no rule
 * for `person`, `frame`, `shape` or `shadow`: nothing in these features can prove them).
 *
 * The confidence is derived from how the vote actually went: how decisive the win was, how many
 * independent rules agreed, and how much weight they carried. It is therefore different for every
 * input, and a single weak rule cannot produce a high number.
 */
import type { LayerClass, PixelRect } from './types'

export interface ClassifyFeatures {
  bounds: PixelRect
  /** Layer area / image area, 0..1. */
  areaFraction: number
  aspect: number
  fillRatio: number
  touchesBorder: boolean
  meanColor: { r: number; g: number; b: number }
  /** True when the region looks like thin, high-contrast strokes (text/logo candidates). */
  textCandidate: boolean
  /** Mean RGB distance from the estimated background. */
  contrastAgainstBackground: number
}

/** A region must cover this share of the image, touch the border and stay close to the background to be the background. */
const BACKGROUND_AREA = 0.5
const BACKGROUND_CONTRAST = 24
/** Text bands are wide (or tall) with a fair amount of ink inside their box. */
const TEXT_ASPECT = 2.5
const TEXT_FILL = 0.15
/** "Very small" regions: ornaments, stickers, single letters. */
const SMALL_AREA = 0.05
const TINY_AREA = 0.02
/** How far from the background a small region must be before it reads as a real object. */
const HIGH_CONTRAST = 60
const VERY_HIGH_CONTRAST = 100
const DECORATION_CONTRAST = 40
/** A photo fills a decent part of the frame, sits inside the page (no border contact) and is not a stroke. */
const PHOTO_AREA = 0.08
const PHOTO_FILL_LOW = 0.35
const PHOTO_FILL_HIGH = 0.98
/** Thin strokes: little ink in the box. */
const LOGO_FILL = 0.25
const LOGO_AREA = 0.2
const THIN_FILL = 0.15
const THIN_AREA = 0.1

interface Rule {
  layerClass: LayerClass
  /** How much this rule contributes when it fires (1 = weak corroboration, 3 = decisive). */
  weight: number
  test: (features: ClassifyFeatures) => boolean
}

const isBlob = (features: ClassifyFeatures): boolean =>
  features.aspect >= 0.4 && features.aspect <= 2.5 && features.fillRatio >= 0.5

/**
 * Rules are evaluated independently and accumulate weight per class; order is only a deterministic
 * tie-breaker (the class whose rule fired first wins an exact tie).
 */
const RULES: readonly Rule[] = [
  // ── background: nearly the whole page, touching the border, no contrast against the background ──
  {
    layerClass: 'background',
    weight: 3,
    test: (f) => f.touchesBorder && f.areaFraction >= BACKGROUND_AREA && f.contrastAgainstBackground <= BACKGROUND_CONTRAST,
  },
  // ── text: wide (or tall) band, real ink inside, stroke evidence ──
  {
    layerClass: 'text',
    weight: 3,
    test: (f) => f.textCandidate && f.aspect >= TEXT_ASPECT && f.fillRatio >= TEXT_FILL,
  },
  {
    layerClass: 'text',
    weight: 3,
    test: (f) => f.textCandidate && f.aspect <= 1 / TEXT_ASPECT && f.fillRatio >= TEXT_FILL,
  },
  {
    layerClass: 'text',
    weight: 1,
    test: (f) => f.textCandidate && f.fillRatio >= 0.3 && f.areaFraction <= 0.25,
  },
  // ── sticker: tiny, very high contrast, solid compact blob ──
  {
    layerClass: 'sticker',
    weight: 3,
    test: (f) => f.areaFraction <= SMALL_AREA && f.contrastAgainstBackground >= HIGH_CONTRAST && isBlob(f),
  },
  {
    layerClass: 'sticker',
    weight: 2,
    test: (f) => f.areaFraction <= SMALL_AREA && f.contrastAgainstBackground >= VERY_HIGH_CONTRAST,
  },
  // ── decoration: tiny and clearly separated from the background, but not a solid blob ──
  {
    layerClass: 'decoration',
    weight: 2,
    test: (f) => f.areaFraction <= SMALL_AREA && f.contrastAgainstBackground >= HIGH_CONTRAST && !isBlob(f),
  },
  {
    layerClass: 'decoration',
    weight: 1,
    test: (f) => f.areaFraction <= TINY_AREA && f.contrastAgainstBackground >= DECORATION_CONTRAST,
  },
  // ── photo: a large, decently filled, non-border, non-stroke block ──
  {
    layerClass: 'photo',
    weight: 3,
    test: (f) =>
      f.areaFraction >= PHOTO_AREA &&
      !f.touchesBorder &&
      f.fillRatio >= PHOTO_FILL_LOW &&
      f.fillRatio <= PHOTO_FILL_HIGH &&
      !f.textCandidate,
  },
  {
    layerClass: 'photo',
    weight: 2,
    test: (f) => f.areaFraction >= 0.15 && f.fillRatio >= 0.3 && !f.touchesBorder,
  },
  // ── logo: thin strokes that are not text-shaped ──
  {
    layerClass: 'logo',
    weight: 3,
    test: (f) => f.fillRatio <= LOGO_FILL && f.textCandidate && f.areaFraction <= LOGO_AREA,
  },
  {
    layerClass: 'logo',
    weight: 1,
    test: (f) => f.fillRatio <= THIN_FILL && !f.textCandidate && f.areaFraction <= THIN_AREA,
  },
]

/** No-evidence case: nothing fired, so the layer keeps its neutral class. */
const UNKNOWN_CONFIDENCE = 0.12

/**
 * Classifies one region from measured features. Returns `unknown` (with low confidence) whenever no
 * rule fires, instead of guessing; a contested win keeps its class but a visibly lower confidence.
 */
export function classifyRegion(features: ClassifyFeatures): { layerClass: LayerClass; confidence: number } {
  const votes = new Map<LayerClass, number>()
  const support = new Map<LayerClass, number>()
  const order: LayerClass[] = []
  for (const rule of RULES) {
    if (!rule.test(features)) continue
    if (!votes.has(rule.layerClass)) order.push(rule.layerClass)
    votes.set(rule.layerClass, (votes.get(rule.layerClass) ?? 0) + rule.weight)
    support.set(rule.layerClass, (support.get(rule.layerClass) ?? 0) + 1)
  }

  let total = 0
  for (const value of votes.values()) total += value
  if (total === 0) return { layerClass: 'unknown', confidence: UNKNOWN_CONFIDENCE }

  let winner: LayerClass = 'unknown'
  let winnerVotes = -1
  for (const layerClass of order) {
    const value = votes.get(layerClass) ?? 0
    if (value > winnerVotes) {
      winnerVotes = value
      winner = layerClass
    }
  }
  let runnerUpVotes = 0
  for (const layerClass of order) {
    if (layerClass === winner) continue
    runnerUpVotes = Math.max(runnerUpVotes, votes.get(layerClass) ?? 0)
  }

  const margin = total > 0 ? (winnerVotes - runnerUpVotes) / total : 0
  const supportScore = Math.min(1, ((support.get(winner) ?? 1) - 1) / 2)
  const strengthScore = Math.min(1, winnerVotes / 5)
  const confidence = Math.max(
    0.15,
    Math.min(0.95, 0.15 + 0.3 * margin + 0.25 * supportScore + 0.3 * strengthScore),
  )
  return { layerClass: winner, confidence }
}
