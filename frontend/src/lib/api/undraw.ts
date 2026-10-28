/**
 * unDraw illustrations – completely free, no-key open source.
 * Served from unpkg CDN: undraw-svg@2.0.0
 */
export interface UndrawItem {
  id: string
  title: string
  slug: string
  svgUrl: string
  thumbUrl: string
}

const CDN = 'https://unpkg.com/undraw-svg@2.0.0/svgs'

const ILLUSTRATIONS = [
  'homework-research',
  'random-thoughts',
  'teamwork',
  'document-ready',
  'overly-proud',
  'love-messages',
  'travel-booking',
  'continuous-learning',
  'customize-app',
  'watering-plants',
  'weather-forecast',
  'product-demo',
  'online-profile',
  'thought-process',
  'online-stats',
  'analytics-setup',
  'programming',
  'unlock',
  'sign-here',
  'sports-scores',
  'mindfulness',
  'friendly-guy-avatar',
  'researching',
  'color-palette',
  'halloween-2025',
  'key-insights',
  'predictive-analytics',
  'website-visitors',
  'distractions',
  'my-resume',
  'two-factor-authentication',
  'eating-together',
  'home-screen',
  'social-update',
  'large-language-models',
  'customer-survey',
  'loading-ui',
  'money-received',
  'connection-lost',
  'visual-explanation',
  'referral',
  'capture-the-moment',
  'newsfeed',
  'male-athlete-avatar',
  'windows',
  'completing',
  'personal-finance',
  'fall',
  'presentation',
  'true-friends',
  'mcp-server',
  'online-meeting',
]

export function listUndraw(): UndrawItem[] {
  return ILLUSTRATIONS.map((slug) => {
    const id = `undraw:${slug}`
    return {
      id,
      title: slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      slug,
      svgUrl: `${CDN}/${slug}.svg`,
      thumbUrl: `${CDN}/${slug}.svg`,
    }
  })
}

export function searchUndraw(query: string): Promise<UndrawItem[]> {
  const q = query.trim().toLowerCase()
  const items = listUndraw()
  if (!q) return Promise.resolve(items.slice(0, 24))
  const filtered = items.filter((i) => i.title.toLowerCase().includes(q) || i.slug.includes(q))
  return Promise.resolve(filtered.slice(0, 48))
}
