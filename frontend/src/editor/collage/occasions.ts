/**
 * Occasion starter kits for Smart Collage Studio.
 *
 * A kit is data, not an action: a four-photo layout, a page background, frame colours and a small
 * set of hand-written vector stickers. The panel applies it in three undoable steps (collage frames,
 * page background, then the editable title badge and stickers), so a user can take the look apart.
 *
 * The SVGs are local strings, so there is no asset download and no outside service. Lazy-loaded.
 */
import type { CollageFrameSpec, CollageStyle, GradientStop, PageBackground } from '@/types/document'
import { generateProcedural, type ProceduralRecipe } from './smartGenerators'

export type OccasionId = 'birthday' | 'wedding' | 'baby' | 'graduation' | 'travel' | 'ramadan' | 'memorial'

export interface OccasionSticker {
  id: string
  name: string
  /** A complete `<svg>` string with a 100 x 100 viewBox. */
  svg: string
  /** Centre on the page, as a fraction of the page size (0..1). */
  x: number
  y: number
  /** Longest side as a fraction of the page's shorter side. */
  size: number
  opacity?: number
}

export interface OccasionKit {
  id: OccasionId
  label: string
  hint: string
  /** Editable Arabic headline of the badge. */
  titleAr: string
  /** Editable English line under it. */
  titleEn: string
  background: PageBackground
  style: Partial<CollageStyle>
  accent: string
  badgeColor: string
  textColor: string
  recipe: ProceduralRecipe
  seed: number
  /** The four-photo layout the kit starts with. */
  frames: CollageFrameSpec[]
  stickers: OccasionSticker[]
}

const gradient = (stops: readonly GradientStop[], angle = 135): PageBackground => ({
  type: 'gradient',
  kind: 'linear',
  angle,
  stops: stops.map((stop) => ({ ...stop })),
})

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`

const star = (x: number, y: number, size: number, fill: string): string =>
  `<path d="M${x} ${y - size}l${size * 0.3} ${size * 0.7} ${size * 0.76} ${size * 0.08}-${size * 0.55} ${size * 0.52} ${size * 0.17} ${size * 0.74}-${size * 0.68}-${size * 0.4}-${size * 0.68} ${size * 0.4} ${size * 0.17}-${size * 0.74}-${size * 0.55}-${size * 0.52} ${size * 0.76}-${size * 0.08}Z" fill="${fill}"/>`

const BALLOON = svg(
  '<path d="M50 7c-15 0-26 12-26 28 0 18 17 34 26 47 9-13 26-29 26-47C76 19 65 7 50 7Z" fill="#e05a6b"/>'
  + '<path d="M45 82l-5 9h20l-5-9Z" fill="#b8455a"/>'
  + '<path d="M50 91c-6 5-6 10 0 12 6-2 6-7 0-12Z" fill="#d4af37"/>'
  + '<path d="M40 20c-5 4-8 10-8 17" fill="none" stroke="#f4a3ad" stroke-width="4" stroke-linecap="round"/>',
)
const CONFETTI = svg(
  '<rect x="12" y="18" width="7" height="16" rx="3" fill="#f2c14e" transform="rotate(-24 15 26)"/>'
  + '<rect x="76" y="14" width="7" height="16" rx="3" fill="#5aa6a6" transform="rotate(28 80 22)"/>'
  + '<circle cx="26" cy="66" r="6" fill="#e05a6b"/>'
  + '<circle cx="80" cy="70" r="5" fill="#d4af37"/>'
  + '<rect x="52" y="80" width="7" height="14" rx="3" fill="#7a64e0" transform="rotate(16 55 87)"/>',
)
const PARTY_STAR = svg(star(50, 50, 42, '#f2c14e') + star(22, 22, 10, '#e05a6b') + star(80, 26, 7, '#5aa6a6'))

const RINGS = svg(
  '<circle cx="36" cy="56" r="23" fill="none" stroke="#d4af37" stroke-width="6"/>'
  + '<circle cx="64" cy="44" r="23" fill="none" stroke="#f0d98a" stroke-width="6"/>'
  + star(64, 14, 12, '#f0d98a'),
)
const WEDDING_HEART = svg(
  '<path d="M50 90C26 71 12 56 12 38c0-13 10-23 23-23 8 0 13 4 15 9 2-5 7-9 15-9 13 0 23 10 23 23 0 18-14 33-38 52Z" fill="#d96b7f"/>'
  + '<path d="M50 82C30 66 18 53 18 39c0-8 7-15 16-15 6 0 11 3 13 8l3 7 3-7c2-5 7-8 13-8 9 0 16 7 16 15 0 14-12 27-32 43Z" fill="none" stroke="#f4a3ad" stroke-width="3"/>',
)
const WEDDING_LEAF = svg(
  '<path d="M50 92V24" stroke="#d4af37" stroke-width="3" stroke-linecap="round"/>'
  + '<ellipse cx="40" cy="40" rx="12" ry="6" fill="#d4af37" transform="rotate(-35 40 40)"/>'
  + '<ellipse cx="60" cy="52" rx="12" ry="6" fill="#d4af37" transform="rotate(35 60 52)"/>'
  + '<ellipse cx="40" cy="64" rx="12" ry="6" fill="#d4af37" transform="rotate(-35 40 64)"/>'
  + '<ellipse cx="60" cy="76" rx="12" ry="6" fill="#d4af37" transform="rotate(35 60 76)"/>',
)

const CLOUD = svg(
  '<path d="M24 72c-9 0-15-6-15-14 0-8 7-14 15-13 2-10 10-17 21-17 12 0 21 9 22 21 9 0 16 6 16 15 0 8-6 12-15 12H24Z" fill="#cfe3f7"/>'
  + '<circle cx="42" cy="50" r="3" fill="#5b7f9e"/><circle cx="58" cy="50" r="3" fill="#5b7f9e"/>'
  + '<path d="M45 58c3 3 7 3 10 0" fill="none" stroke="#5b7f9e" stroke-width="3" stroke-linecap="round"/>',
)
const MOON = svg('<path d="M64 10a40 40 0 1 0 26 56A31 31 0 0 1 64 10Z" fill="#f5d98b"/>' + star(78, 22, 9, '#f2c14e'))
const BABY_STAR = svg(star(50, 52, 40, '#f5d98b') + '<circle cx="34" cy="80" r="5" fill="#a9cbe8"/><circle cx="68" cy="78" r="4" fill="#a9cbe8"/>')

const CAP = svg(
  '<path d="M50 16 6 37l44 20 44-20-44-21Z" fill="#2f3e5c"/>'
  + '<path d="M24 47v17c0 8 12 15 26 15s26-7 26-15V47L50 59 24 47Z" fill="#3f5170"/>'
  + '<path d="M92 38v25" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/>'
  + '<circle cx="92" cy="67" r="6" fill="#d4af37"/>',
)
const DIPLOMA = svg(
  '<rect x="12" y="28" width="76" height="46" rx="4" fill="#f5efe2" stroke="#d4af37" stroke-width="3"/>'
  + '<path d="M22 40h34M22 50h44M22 60h26" stroke="#b9a88a" stroke-width="4" stroke-linecap="round"/>'
  + '<circle cx="72" cy="62" r="9" fill="#d4af37"/><path d="M72 71l-5 12 5-4 5 4-5-12Z" fill="#b8455a"/>',
)
const GRAD_STAR = svg(star(50, 50, 40, '#d4af37') + star(18, 20, 8, '#f2c14e'))

const PLANE = svg(
  '<path d="M94 50 63 44 50 8 40 8l6 38-27 8-6-14H4l6 20-6 20h9l6-14 27 8-6 38h10l13-38 31-6V50Z" fill="#3d7ea6"/>',
)
const PIN = svg(
  '<path d="M50 6c-14 0-25 11-25 26 0 19 25 62 25 62s25-43 25-62C75 17 64 6 50 6Z" fill="#d96b5f"/>'
  + '<circle cx="50" cy="32" r="10" fill="#fff3e6"/>',
)
const SUN = svg(
  '<circle cx="50" cy="50" r="18" fill="#f2c14e"/>'
  + '<g stroke="#f2c14e" stroke-width="5" stroke-linecap="round">'
  + '<path d="M50 14v10M50 76v10M14 50h10M76 50h10M25 25l7 7M68 68l7 7M75 25l-7 7M32 68l-7 7"/>'
  + '</g>',
)

const CRESCENT = svg(
  '<path d="M64 8a42 42 0 1 0 24 56A34 34 0 0 1 64 8Z" fill="#d4af37"/>' + star(76, 26, 9, '#f0d98a'),
)
const LANTERN = svg(
  '<path d="M50 6v9" stroke="#d4af37" stroke-width="4"/>'
  + '<path d="M40 18h20l6 10v40l-6 10H40l-6-10V28l6-10Z" fill="#d4af37"/>'
  + '<path d="M44 30h12v34H44Z" fill="#8a6a1f"/>'
  + '<path d="M38 78h24" stroke="#d4af37" stroke-width="5" stroke-linecap="round"/>'
  + '<circle cx="50" cy="46" r="6" fill="#f7ecb0"/>',
)
const EIGHT_STAR = svg(
  '<path d="M50 6l10 22 22-10-10 22 22 10-22 10 10 22-22-10-10 22-10-22-22 10 10-22-22-10 22-10-10-22 22 10Z" fill="#d4af37"/>',
)

const LAUREL = svg(
  '<path d="M34 92C20 74 20 44 40 16" fill="none" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/>'
  + '<ellipse cx="30" cy="40" rx="11" ry="5" fill="#d4af37" transform="rotate(-42 30 40)"/>'
  + '<ellipse cx="36" cy="56" rx="11" ry="5" fill="#d4af37" transform="rotate(-32 36 56)"/>'
  + '<ellipse cx="42" cy="72" rx="11" ry="5" fill="#d4af37" transform="rotate(-22 42 72)"/>'
  + '<path d="M66 92C80 74 80 44 60 16" fill="none" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/>'
  + '<ellipse cx="70" cy="40" rx="11" ry="5" fill="#d4af37" transform="rotate(42 70 40)"/>'
  + '<ellipse cx="64" cy="56" rx="11" ry="5" fill="#d4af37" transform="rotate(32 64 56)"/>'
  + '<ellipse cx="58" cy="72" rx="11" ry="5" fill="#d4af37" transform="rotate(22 58 72)"/>',
)
const MONOGRAM = svg(
  '<rect x="18" y="18" width="64" height="64" rx="10" fill="none" stroke="#d4af37" stroke-width="4"/>'
  + '<path d="M50 30v40M34 44h32" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/>',
)

const kits: readonly Omit<OccasionKit, 'frames'>[] = [
  {
    id: 'birthday',
    label: 'Birthday',
    hint: 'Coral, confetti and a bright four-up grid.',
    titleAr: 'عيد ميلاد سعيد',
    titleEn: 'Happy birthday',
    background: gradient([
      { offset: 0, color: '#fff3ec' },
      { offset: 1, color: '#f9d9cd' },
    ]),
    style: { matColor: '#fff8f1', outerColor: '#e05a6b', innerColor: '#f2c14e' },
    accent: '#e05a6b',
    badgeColor: '#fff8f1',
    textColor: '#8c2f3c',
    recipe: 'bsp',
    seed: 1409,
    stickers: [
      { id: 'balloon', name: 'Balloon', svg: BALLOON, x: 0.14, y: 0.12, size: 0.18 },
      { id: 'confetti', name: 'Confetti', svg: CONFETTI, x: 0.86, y: 0.14, size: 0.16 },
      { id: 'star', name: 'Party star', svg: PARTY_STAR, x: 0.84, y: 0.82, size: 0.14 },
    ],
  },
  {
    id: 'wedding',
    label: 'Wedding',
    hint: 'Ivory, gold rings and a calm editorial split.',
    titleAr: 'زفاف مبارك',
    titleEn: 'Just married',
    background: gradient([
      { offset: 0, color: '#fffdf8' },
      { offset: 1, color: '#efe4cf' },
    ]),
    style: { matColor: '#fffdf8', outerColor: '#d4af37', innerColor: '#b9963b' },
    accent: '#d4af37',
    badgeColor: '#fffdf8',
    textColor: '#6b5423',
    recipe: 'mondrian',
    seed: 1717,
    stickers: [
      { id: 'rings', name: 'Rings', svg: RINGS, x: 0.5, y: 0.1, size: 0.17 },
      { id: 'heart', name: 'Heart', svg: WEDDING_HEART, x: 0.87, y: 0.83, size: 0.12 },
      { id: 'leaf', name: 'Gold leaf', svg: WEDDING_LEAF, x: 0.12, y: 0.8, size: 0.15 },
    ],
  },
  {
    id: 'baby',
    label: 'Baby',
    hint: 'Soft blue, a moon and rounded frames.',
    titleAr: 'أهلاً بالصغير',
    titleEn: 'Hello little one',
    background: gradient([
      { offset: 0, color: '#f4fbff' },
      { offset: 1, color: '#dcecf7' },
    ]),
    style: { matColor: '#fbfeff', outerColor: '#8fb9d9', innerColor: '#cfe3f7', radius: 14 },
    accent: '#8fb9d9',
    badgeColor: '#fbfeff',
    textColor: '#41647f',
    recipe: 'spiral',
    seed: 2131,
    stickers: [
      { id: 'cloud', name: 'Cloud', svg: CLOUD, x: 0.18, y: 0.12, size: 0.19 },
      { id: 'moon', name: 'Moon', svg: MOON, x: 0.85, y: 0.13, size: 0.16 },
      { id: 'star', name: 'Star', svg: BABY_STAR, x: 0.84, y: 0.84, size: 0.13 },
    ],
  },
  {
    id: 'graduation',
    label: 'Graduation',
    hint: 'Navy and gold, with a proud feature frame.',
    titleAr: 'تهانينا بالتخرج',
    titleEn: 'Congratulations, graduate',
    background: gradient([
      { offset: 0, color: '#f7f4ea' },
      { offset: 1, color: '#dfe3ec' },
    ]),
    style: { matColor: '#f7f4ea', outerColor: '#d4af37', innerColor: '#2f3e5c' },
    accent: '#2f3e5c',
    badgeColor: '#2f3e5c',
    textColor: '#f7f4ea',
    recipe: 'bsp',
    seed: 2711,
    stickers: [
      { id: 'cap', name: 'Graduation cap', svg: CAP, x: 0.16, y: 0.12, size: 0.19 },
      { id: 'diploma', name: 'Diploma', svg: DIPLOMA, x: 0.85, y: 0.83, size: 0.16 },
      { id: 'star', name: 'Gold star', svg: GRAD_STAR, x: 0.84, y: 0.13, size: 0.11 },
    ],
  },
  {
    id: 'travel',
    label: 'Travel',
    hint: 'Teal, sand and a wide film-strip layout.',
    titleAr: 'رحلة سعيدة',
    titleEn: 'Wander often',
    background: gradient([
      { offset: 0, color: '#eef8f7' },
      { offset: 1, color: '#f1e6d2' },
    ]),
    style: { matColor: '#fffaf0', outerColor: '#3d7ea6', innerColor: '#d8b26a' },
    accent: '#3d7ea6',
    badgeColor: '#fffaf0',
    textColor: '#28546f',
    recipe: 'bsp',
    seed: 3301,
    stickers: [
      { id: 'plane', name: 'Aeroplane', svg: PLANE, x: 0.84, y: 0.12, size: 0.16 },
      { id: 'pin', name: 'Pin', svg: PIN, x: 0.15, y: 0.82, size: 0.13 },
      { id: 'sun', name: 'Sun', svg: SUN, x: 0.86, y: 0.85, size: 0.12 },
    ],
  },
  {
    id: 'ramadan',
    label: 'Ramadan & Eid',
    hint: 'Deep green, gold crescent and an RTL-friendly grid.',
    titleAr: 'رمضان كريم',
    titleEn: 'Ramadan Kareem',
    background: gradient([
      { offset: 0, color: '#08231c' },
      { offset: 1, color: '#14453a' },
    ]),
    style: { matColor: '#f7efdc', outerColor: '#d4af37', innerColor: '#f0d98a' },
    accent: '#d4af37',
    badgeColor: '#0f2f26',
    textColor: '#f7efdc',
    recipe: 'mondrian',
    seed: 3907,
    stickers: [
      { id: 'crescent', name: 'Crescent', svg: CRESCENT, x: 0.15, y: 0.11, size: 0.17 },
      { id: 'lantern', name: 'Lantern', svg: LANTERN, x: 0.85, y: 0.12, size: 0.18 },
      { id: 'star', name: 'Eight-point star', svg: EIGHT_STAR, x: 0.85, y: 0.84, size: 0.12 },
    ],
  },
  {
    id: 'memorial',
    label: 'Memorial & luxury',
    hint: 'Charcoal, ivory and a quiet gold gallery.',
    titleAr: 'في ذكرى غالية',
    titleEn: 'In loving memory',
    background: gradient([
      { offset: 0, color: '#232323' },
      { offset: 1, color: '#3b3733' },
    ]),
    style: { matColor: '#f6f2e9', outerColor: '#d4af37', innerColor: '#b9963b' },
    accent: '#d4af37',
    badgeColor: '#1d1c1a',
    textColor: '#f6f2e9',
    recipe: 'spiral',
    seed: 4513,
    stickers: [
      { id: 'laurel', name: 'Laurel', svg: LAUREL, x: 0.16, y: 0.12, size: 0.18 },
      { id: 'monogram', name: 'Monogram frame', svg: MONOGRAM, x: 0.85, y: 0.14, size: 0.14 },
      { id: 'star', name: 'Gold star', svg: GRAD_STAR, x: 0.85, y: 0.85, size: 0.1 },
    ],
  },
]

export const OCCASION_KITS: readonly OccasionKit[] = kits.map((kit) => ({
  ...kit,
  frames: generateProcedural(kit.seed, 4, kit.recipe, 0.016),
}))

export function occasionKit(id: OccasionId): OccasionKit | undefined {
  return OCCASION_KITS.find((kit) => kit.id === id)
}

/** The kit's frames for any photo count; the four-photo composition stays the hand-tuned one. */
export function occasionFrames(kit: OccasionKit, count: number): CollageFrameSpec[] {
  const n = Math.max(1, Math.min(16, Math.round(count)))
  if (n === kit.frames.length) return kit.frames.map((frame) => ({ ...frame }))
  return generateProcedural(kit.seed, n, kit.recipe, 0.016)
}
