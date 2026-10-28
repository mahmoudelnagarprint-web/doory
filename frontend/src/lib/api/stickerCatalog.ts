/**
 * The curated Stickers-tab catalogue: category → explicit icon id list.
 *
 * This is a fairly large literal, so it lives in its own module that is only
 * fetched through `import()` (from `megaAssets` and the Elements Panel). It
 * never lands in the editor's initial bundle.
 */

export interface CuratedStickerCategory {
  id: string
  label: string
  iconIds: string[] // prefix:name
}

export const CURATED_STICKER_CATEGORIES: CuratedStickerCategory[] = [
  { id: 'all', label: 'All Stickers', iconIds: [] },
  { id: 'celebrations', label: 'Celebrations', iconIds: [
    'noto:party-popper','noto:confetti-ball','noto:balloon','noto:sparkles','noto:wrapped-gift',
    'noto:sparkler','noto:fireworks','noto:mirror-ball','noto:pinata','noto:red-envelope',
    'twemoji:party-popper','twemoji:confetti-ball','twemoji:balloon','twemoji:sparkles',
    'fluent-emoji-flat:party-popper','fluent-emoji-flat:balloon','fluent-emoji-flat:sparkles',
    'emojione:party-popper','emojione:confetti-ball','emojione:sparkles',
    'openmoji:party-popper','openmoji:confetti-ball','openmoji:balloon',
  ]},
  { id: 'faces', label: 'Faces & Emotions', iconIds: [
    'noto:grinning-face','noto:face-with-tears-of-joy','noto:smiling-face-with-heart-eyes',
    'noto:star-struck','noto:smiling-face-with-sunglasses','noto:zany-face',
    'noto:rolling-on-the-floor-laughing','noto:partying-face','noto:smiling-face-with-halo',
    'noto:nerd-face','noto:face-blowing-a-kiss','noto:winking-face','noto:smirking-face',
    'noto:upside-down-face','noto:face-savoring-food','noto:beaming-face-with-smiling-eyes',
    'noto:hugging-face','twemoji:grinning-face','twemoji:smiling-face-with-heart-eyes',
    'fluent-emoji-flat:grinning-face','fluent-emoji-flat:smiling-face-with-heart-eyes',
    'emojione:grinning-face','emojione:smiling-face-with-heart-eyes',
  ]},
  { id: 'hearts-symbols', label: 'Hearts & Symbols', iconIds: [
    'noto:heart-suit','noto:sparkling-heart','noto:growing-heart','noto:two-hearts',
    'noto:high-voltage','noto:hundred-points','noto:rainbow','noto:fire','noto:collision',
    'twemoji:heart','twemoji:sparkling-heart','twemoji:fire','twemoji:rainbow',
    'fluent-emoji-flat:red-heart','fluent-emoji-flat:sparkling-heart','fluent-emoji-flat:fire',
    'fluent-emoji-flat:rainbow','emojione:red-heart','emojione:sparkling-heart',
    'emojione:fire','emojione:rainbow',
  ]},
  { id: 'animals', label: 'Animals & Nature', iconIds: [
    'noto:dog-face','noto:cat-face','noto:monkey-face','noto:lion','noto:tiger-face',
    'noto:panda','noto:unicorn','noto:dolphin','noto:butterfly','noto:honeybee',
    'noto:penguin','noto:koala','noto:fox','noto:peacock','noto:rabbit-face',
    'noto:pig-face','noto:cow-face','noto:horse-face','noto:frog','noto:owl',
    'twemoji:dog-face','twemoji:cat-face','fluent-emoji-flat:dog-face',
    'emojione:dog-face','emojione:cat-face',
  ]},
  { id: 'food', label: 'Food & Drink', iconIds: [
    'noto:pizza','noto:hamburger','noto:french-fries','noto:ice-cream','noto:birthday-cake',
    'noto:cupcake','noto:doughnut','noto:cookie','noto:hot-beverage','noto:strawberry',
    'noto:watermelon','noto:sushi','noto:taco','noto:ramen','noto:croissant',
    'twemoji:pizza','twemoji:hamburger','twemoji:ice-cream','twemoji:birthday-cake',
    'fluent-emoji-flat:pizza','fluent-emoji-flat:hamburger','fluent-emoji-flat:ice-cream',
    'emojione:pizza','emojione:hamburger','emojione:ice-cream',
  ]},
  { id: 'nature', label: 'Nature & Weather', iconIds: [
    'noto:sun','noto:sun-with-face','noto:full-moon','noto:cloud','noto:snowflake',
    'noto:sunflower','noto:rose','noto:cherry-blossom','noto:four-leaf-clover',
    'noto:seedling','noto:palm-tree','noto:maple-leaf','noto:rainbow','noto:hibiscus',
    'twemoji:sun','twemoji:full-moon','twemoji:cloud','twemoji:snowflake',
    'fluent-emoji-flat:sun','fluent-emoji-flat:full-moon','fluent-emoji-flat:cloud',
    'emojione:sun','emojione:full-moon','emojione:cloud',
  ]},
  { id: 'objects', label: 'Objects & Tech', iconIds: [
    'noto:camera-with-flash','noto:video-camera','noto:musical-note','noto:guitar',
    'noto:microphone','noto:headphone','noto:rocket','noto:airplane','noto:trophy',
    'noto:1st-place-medal','noto:graduation-cap','noto:crown','noto:gem-stone',
    'noto:magic-wand','noto:crystal-ball','noto:artist-palette','noto:telephone-receiver',
    'noto:e-mail','noto:mobile-phone','noto:laptop','noto:desktop-computer',
    'twemoji:camera','twemoji:rocket','twemoji:mobile-phone',
    'fluent-emoji-flat:camera','fluent-emoji-flat:rocket','fluent-emoji-flat:laptop',
    'emojione:camera','emojione:rocket','emojione:laptop',
  ]},
  { id: 'arrows-badges', label: 'Arrows & Badges', iconIds: [
    'noto:right-arrow','noto:left-arrow','noto:up-arrow','noto:down-arrow',
    'noto:up-right-arrow','noto:down-right-arrow','noto:curved-arrow',
    'noto:double-curly-loop','noto:double-exclamation','noto:exclamation',
    'noto:question','noto:white-check-mark','noto:check-mark-button',
    'twemoji:right-arrow','twemoji:left-arrow','fluent-emoji-flat:arrow-right',
    'emojione:arrow-right','emojione:check-mark',
  ]},
  { id: 'business', label: 'Business & E-commerce', iconIds: [
    'noto:briefcase','noto:chart-increasing','noto:chart-decreasing','noto:bar-chart',
    'noto:clipboard','noto:file-folder','noto:open-file-folder','noto:card-index',
    'noto:credit-card','noto:receipt','noto:money-bag','noto:coin','noto:banknote',
    'noto:shopping-cart','noto:shopping-bags','noto:package','noto:label',
    'twemoji:briefcase','twemoji:chart-increasing','fluent-emoji-flat:briefcase',
    'emojione:briefcase','emojione:chart-increasing',
  ]},
]
