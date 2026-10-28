/**
 * Gradients & Color Kits Engine
 * uiGradients integration + 30+ curated brand color palettes
 */
export interface GradientDefinition {
  id: string
  name: string
  colors: string[]  // Array of hex colors
  angle?: number    // Default angle for linear gradient
  type: 'linear' | 'radial'
}

export interface ColorKit {
  id: string
  name: string
  colors: string[]  // 5 colors
  tags: string[]
}

/** Fetch uiGradients from GitHub (with local fallback) */
export async function fetchUIGradients(signal?: AbortSignal): Promise<GradientDefinition[]> {
  try {
    const res = await fetch('https://raw.githubusercontent.com/ghosh/uiGradients/master/gradients.json', { signal, credentials: 'omit' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as Array<{ name: string; colors: string[] }>
    return data.map((g, i) => ({
      id: `uigradient-${i}`,
      name: g.name,
      colors: g.colors,
      angle: 135,
      type: 'linear' as const,
    }))
  } catch (e) {
    console.warn('uiGradients fetch failed, using fallback:', e)
    return FALLBACK_GRADIENTS
  }
}

/** Generate CSS gradient string */
export function gradientToCSS(g: GradientDefinition, angle: number = g.angle || 135): string {
  if (g.type === 'radial') {
    return `radial-gradient(circle at center, ${g.colors.join(', ')})`
  }
  return `linear-gradient(${angle}deg, ${g.colors.join(', ')})`
}

/** Generate SVG gradient markup for canvas background */
export function gradientToSVG(g: GradientDefinition, width: number, height: number, angle: number = g.angle || 135): string {
  const id = `grad-${g.id}`
  const stops = g.colors.map((c, i) => `<stop offset="${(i / (g.colors.length - 1)) * 100}%" stop-color="${c}"/>`).join('')
  if (g.type === 'radial') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><radialGradient id="${id}" cx="50%" cy="50%" r="50%">${stops}</radialGradient></defs><rect width="100%" height="100%" fill="url(#${id})"/></svg>`
  }
  const rad = (angle * Math.PI) / 180
  const x1 = Math.round(50 + Math.cos(rad) * 50)
  const y1 = Math.round(50 + Math.sin(rad) * 50)
  const x2 = Math.round(50 - Math.cos(rad) * 50)
  const y2 = Math.round(50 - Math.sin(rad) * 50)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient></defs><rect width="100%" height="100%" fill="url(#${id})"/></svg>`
}

// ============================================
// FALLBACK GRADIENTS (60 top gradients)
// ============================================
export const FALLBACK_GRADIENTS: GradientDefinition[] = [
  { id: 'mauve', name: 'Mauve', colors: ['#42275a', '#734b6d'], type: 'linear' },
  { id: 'back-to-earth', name: 'Back to Earth', colors: ['#2c3e50', '#4ca1af'], type: 'linear' },
  { id: 'deep-sea-space', name: 'Deep Sea Space', colors: ['#2c3e50', '#1a1a2e', '#16213e'], type: 'linear' },
  { id: 'evening-sunshine', name: 'Evening Sunshine', colors: ['#bdc3c7', '#2c3e50'], type: 'linear' },
  { id: 'sweet-morning', name: 'Sweet Morning', colors: ['#f5af19', '#f12711'], type: 'linear' },
  { id: 'deep-blue', name: 'Deep Blue', colors: ['#1e3c72', '#2a5298'], type: 'linear' },
  { id: 'danki', name: 'Danki', colors: ['#0f2027', '#203a43', '#2c5364'], type: 'linear' },
  { id: 'ash', name: 'Ash', colors: ['#606c88', '#3f4c6b'], type: 'linear' },
  { id: 'ripe-malinka', name: 'Ripe Malinka', colors: ['#f093fb', '#f5576c'], type: 'linear' },
  { id: 'cloudy-knoxville', name: 'Cloudy Knoxville', colors: ['#403b4a', '#e7e9bb'], type: 'linear' },
  { id: 'malibu-beach', name: 'Malibu Beach', colors: ['#4cb8c4', '#3cd3ad'], type: 'linear' },
  { id: 'new-life', name: 'New Life', colors: ['#43cea2', '#185a9d'], type: 'linear' },
  { id: 'true-sunshine', name: 'True Sunshine', colors: ['#fdc830', '#f37335'], type: 'linear' },
  { id: 'morning-salad', name: 'Morning Salad', colors: ['#1d976c', '#93f9b9'], type: 'linear' },
  { id: 'flying-lemon', name: 'Flying Lemon', colors: ['#f7971e', '#ffd200'], type: 'linear' },
  { id: 'sunset', name: 'Sunset', colors: ['#fceabb', '#f8b500'], type: 'linear' },
  { id: 'grapefruit-sunset', name: 'Grapefruit Sunset', colors: ['#e96443', '#904e95'], type: 'linear' },
  { id: 'sea-blush', name: 'Sea Blush', colors: ['#e8cbc0', '#636fa4'], type: 'linear' },
  { id: 'lady-lips', name: 'Lady Lips', colors: ['#ff9a9e', '#fecfef', '#fecfef'], type: 'linear' },
  { id: 'plum-bath', name: 'Plum Bath', colors: ['#cb2d3e', '#ef473a'], type: 'linear' },
  { id: 'frozen-dreams', name: 'Frozen Dreams', colors: ['#f7f8f3', '#acbbd0', '#748cab', '#344e7c'], type: 'linear' },
  { id: 'winter-neva', name: 'Winter Neva', colors: ['#a1c4fd', '#c2e9fb'], type: 'linear' },
  { id: 'dusty-grass', name: 'Dusty Grass', colors: ['#d4fc79', '#96e6a1'], type: 'linear' },
  { id: 'tempting-azure', name: 'Tempting Azure', colors: ['#6a11cb', '#2575fc'], type: 'linear' },
  { id: 'heavy-rain', name: 'Heavy Rain', colors: ['#cfd9df', '#e2ebf0'], type: 'linear' },
  { id: 'amy-crisp', name: 'Amy Crisp', colors: ['#e8cbc0', '#636fa4'], type: 'linear' },
  { id: 'mean-fruit', name: 'Mean Fruit', colors: ['#fc466b', '#3f5efb'], type: 'linear' },
  { id: 'soft-morning', name: 'Soft Morning', colors: ['#e0c3fc', '#8ec5fc'], type: 'linear' },
  { id: 'ripe-mango', name: 'Ripe Mango', colors: ['#f093fb', '#f5576c'], type: 'linear' },
  { id: 'near-moon', name: 'Near Moon', colors: ['#5ee7df', '#b490ca'], type: 'linear' },
  { id: 'wild-apple', name: 'Wild Apple', colors: ['#4cb8c4', '#3cd3ad'], type: 'linear' },
  { id: 'love-kiss', name: 'Love Kiss', colors: ['#ff0844', '#ffb199'], type: 'linear' },
  { id: 'amazing-day', name: 'Amazing Day', colors: ['#ff5f6d', '#ffc371'], type: 'linear' },
  { id: 'happy-fisher', name: 'Happy Fisher', colors: ['#89f7fe', '#66a6ff'], type: 'linear' },
  { id: 'strong-bliss', name: 'Strong Bliss', colors: ['#f78ca0', '#f9748f', '#fd868c', '#fe9a8b'], type: 'linear' },
  { id: 'fresh-milk', name: 'Fresh Milk', colors: ['#fdfbf7', '#ebedee'], type: 'linear' },
  { id: 'rainy-ashville', name: 'Rainy Ashville', colors: ['#606c88', '#3f4c6b'], type: 'linear' },
  { id: 'frozen-heat', name: 'Frozen Heat', colors: ['#fc466b', '#3f5efb'], type: 'linear' },
  { id: 'night-fade', name: 'Night Fade', colors: ['#2c3e50', '#4ca1af'], type: 'linear' },
  { id: 'premium-dark', name: 'Premium Dark', colors: ['#10002b', '#3d087b'], type: 'linear' },
  { id: 'premium-light', name: 'Premium Light', colors: ['#fdfbf7', '#ebedee'], type: 'linear' },
  { id: 'shady-water', name: 'Shady Water', colors: ['#3e5151', '#decba4'], type: 'linear' },
  { id: 'dirty-beauty', name: 'Dirty Beauty', colors: ['#f5f7fa', '#c3cfe2'], type: 'linear' },
  { id: 'great-whale', name: 'Great Whale', colors: ['#1e3c72', '#2a5298'], type: 'linear' },
  { id: 'teen-notebook', name: 'Teen Notebook', colors: ['#fdfbf7', '#ebedee'], type: 'linear' },
  { id: 'polite-rumors', name: 'Polite Rumors', colors: ['#fdfbf7', '#ebedee'], type: 'linear' },
  { id: 'sky-blue', name: 'Sky Blue', colors: ['#1e3c72', '#2a5298'], type: 'linear' },
  { id: 'heaven-peach', name: 'Heaven Peach', colors: ['#fc466b', '#3f5efb'], type: 'linear' },
  { id: 'mlg-playlist', name: 'MLG Playlist', colors: ['#2c3e50', '#4ca1af'], type: 'linear' },
  { id: 'lush', name: 'Lush', colors: ['#56ab2f', '#a8e063'], type: 'linear' },
  { id: 'victory', name: 'Victory', colors: ['#00c6ff', '#0072ff'], type: 'linear' },
  { id: 'mixed-hopes', name: 'Mixed Hopes', colors: ['#414d0b', '#7d7e3a', '#ccd62e', '#e0e647', '#f4f12e'], type: 'linear' },
  { id: 'fly-high', name: 'Fly High', colors: ['#2c3e50', '#4ca1af'], type: 'linear' },
  { id: 'strong-stick', name: 'Strong Stick', colors: ['#f46b45', '#eea849'], type: 'linear' },
  { id: 'sun-on-the-hill', name: 'Sun on the Hill', colors: ['#f77062', '#fe5196'], type: 'linear' },
  { id: 'vicious-stance', name: 'Vicious Stance', colors: ['#fc466b', '#3f5efb'], type: 'linear' },
  { id: 'tropical-morning', name: 'Tropical Morning', colors: ['#1d976c', '#93f9b9'], type: 'linear' },
  { id: 'royal', name: 'Royal', colors: ['#2c3e50', '#4ca1af'], type: 'linear' },
  { id: 'sherbert', name: 'Sherbert', colors: ['#f7971e', '#ffd200'], type: 'linear' },
  { id: 'bleached-denim', name: 'Bleached Denim', colors: ['#3b5998', '#9b59b6', '#2c3e50'], type: 'linear' },
  { id: 'hercules', name: 'Hercules', colors: ['#1e3c72', '#2a5298'], type: 'linear' },
  { id: 'melon', name: 'Melon', colors: ['#f093fb', '#f5576c'], type: 'linear' },
  { id: 'lighter', name: 'Lighter', colors: ['#fdfbf7', '#ebedee'], type: 'linear' },
  { id: 'vice-city', name: 'Vice City', colors: ['#fc466b', '#3f5efb'], type: 'linear' },
  { id: 'rose-water', name: 'Rose Water', colors: ['#f093fb', '#f5576c'], type: 'linear' },
  { id: 'blooker', name: 'Blooker', colors: ['#6a11cb', '#2575fc'], type: 'linear' },
]

// ============================================
// 30+ CURATED BRAND COLOR KITS (5 colors each)
// ============================================
export const COLOR_KITS: ColorKit[] = [
  { id: 'luxury-gold-black', name: 'Luxury Gold & Black', colors: ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#f39c12'], tags: ['luxury', 'premium', 'dark'] },
  { id: 'pastel-pop', name: 'Pastel Pop', colors: ['#fce4ec', '#f8bbd0', '#f48fb1', '#f06292', '#ec407a'], tags: ['pastel', 'soft', 'feminine'] },
  { id: 'neon-cyber', name: 'Neon Cyber', colors: ['#0d0d0d', '#0f0f0f', '#00ff9f', '#ff00ff', '#00ffff'], tags: ['neon', 'cyberpunk', 'dark'] },
  { id: 'earthy-boho', name: 'Earthy Boho', colors: ['#8b7355', '#a0845e', '#c9b896', '#d4c4a8', '#e8dcc8'], tags: ['earthy', 'boho', 'natural'] },
  { id: 'corporate-clean', name: 'Corporate Clean', colors: ['#ffffff', '#f5f7fa', '#e4e7eb', '#1e3a5f', '#0066cc'], tags: ['corporate', 'professional', 'clean'] },
  { id: 'royal-arabic', name: 'Royal Arabic', colors: ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#e0e1dd'], tags: ['arabic', 'royal', 'elegant'] },
  { id: 'vintage-retro', name: 'Vintage Retro', colors: ['#fefae0', '#f4e1c1', '#e8c547', '#daa520', '#b8860b'], tags: ['vintage', 'retro', 'warm'] },
  { id: 'ocean-breeze', name: 'Ocean Breeze', colors: ['#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#00bcd4'], tags: ['ocean', 'cool', 'fresh'] },
  { id: 'forest-green', name: 'Forest Green', colors: ['#1b5e20', '#2e7d32', '#388e3c', '#4caf50', '#81c784'], tags: ['nature', 'green', 'organic'] },
  { id: 'sunset-vibes', name: 'Sunset Vibes', colors: ['#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726'], tags: ['sunset', 'warm', 'orange'] },
  { id: 'berry-delight', name: 'Berry Delight', colors: ['#fce4ec', '#f8bbd0', '#f48fb1', '#f06292', '#ec407a'], tags: ['berry', 'pink', 'sweet'] },
  { id: 'midnight-purple', name: 'Midnight Purple', colors: ['#1a1a2e', '#16213e', '#4a2c6e', '#7b2cbf', '#e0aaff'], tags: ['purple', 'midnight', 'mystical'] },
  { id: 'fire-ice', name: 'Fire & Ice', colors: ['#0d47a1', '#1565c0', '#1e88e5', '#ff6f00', '#ffab00'], tags: ['contrast', 'blue', 'orange'] },
  { id: 'monochrome', name: 'Monochrome', colors: ['#000000', '#212121', '#424242', '#757575', '#ffffff'], tags: ['minimal', 'bw', 'modern'] },
  { id: 'autumn-leaves', name: 'Autumn Leaves', colors: ['#4e342e', '#5d4037', '#6d4c41', '#8d6e63', '#d7ccc8'], tags: ['autumn', 'warm', 'brown'] },
  { id: 'spring-blossom', name: 'Spring Blossom', colors: ['#e8f5e9', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a'], tags: ['spring', 'green', 'fresh'] },
  { id: 'royal-blue', name: 'Royal Blue', colors: ['#0d47a1', '#1565c0', '#1e88e5', '#42a5f5', '#90caf9'], tags: ['blue', 'royal', 'trust'] },
  { id: 'emerald-dream', name: 'Emerald Dream', colors: ['#004d40', '#00695c', '#00796b', '#009688', '#4db6ac'], tags: ['emerald', 'teal', 'luxury'] },
  { id: 'crimson-glory', name: 'Crimson Glory', colors: ['#b71c1c', '#c62828', '#d32f2f', '#e53935', '#ef5350'], tags: ['red', 'bold', 'passion'] },
  { id: 'golden-hour', name: 'Golden Hour', colors: ['#fff8e1', '#ffecb3', '#ffe082', '#ffd54f', '#ffca28'], tags: ['gold', 'warm', 'sunny'] },
  { id: 'lavender-fields', name: 'Lavender Fields', colors: ['#f3e5f5', '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc'], tags: ['purple', 'lavender', 'soft'] },
  { id: 'steel-modern', name: 'Steel Modern', colors: ['#263238', '#37474f', '#455a64', '#546e7a', '#78909c'], tags: ['steel', 'industrial', 'cool'] },
  { id: 'peach-cream', name: 'Peach Cream', colors: ['#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726'], tags: ['peach', 'warm', 'soft'] },
  { id: 'mint-fresh', name: 'Mint Fresh', colors: ['#e0f2f1', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a'], tags: ['mint', 'fresh', 'clean'] },
  { id: 'ruby-wine', name: 'Ruby Wine', colors: ['#3e2723', '#4e342e', '#5d4037', '#6d4c41', '#8d6e63'], tags: ['wine', 'dark', 'elegant'] },
  { id: 'arctic-ice', name: 'Arctic Ice', colors: ['#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6'], tags: ['ice', 'blue', 'cool'] },
  { id: 'copper-glow', name: 'Copper Glow', colors: ['#3e2723', '#4e342e', '#5d4037', '#8d6e63', '#d7ccc8'], tags: ['copper', 'metallic', 'warm'] },
  { id: 'rose-quartz', name: 'Rose Quartz', colors: ['#fce4ec', '#f8bbd0', '#f48fb1', '#f06292', '#ec407a'], tags: ['rose', 'quartz', 'gentle'] },
  { id: 'serenity', name: 'Serenity', colors: ['#eceff1', '#cfd8dc', '#b0bec5', '#90a4ae', '#78909c'], tags: ['calm', 'blue-gray', 'peaceful'] },
  { id: 'vitality', name: 'Vitality', colors: ['#e8f5e9', '#c8e6c9', '#a5d6a7', '#81c784', '#4caf50'], tags: ['energy', 'green', 'life'] },
  { id: 'passion-fruit', name: 'Passion Fruit', colors: ['#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ff9800'], tags: ['orange', 'energy', 'tropical'] },
]

/** Get color kit by ID */
export function getColorKit(id: string): ColorKit | undefined {
  return COLOR_KITS.find(k => k.id === id)
}

/** Apply color kit to page: returns CSS custom properties */
export function colorKitToCSS(kit: ColorKit): Record<string, string> {
  return {
    '--kit-color-1': kit.colors[0],
    '--kit-color-2': kit.colors[1],
    '--kit-color-3': kit.colors[2],
    '--kit-color-4': kit.colors[3],
    '--kit-color-5': kit.colors[4],
  }
}

/** Shuffle and apply color kit to page elements */
export function shuffleColorKit(kit: ColorKit): string[] {
  return [...kit.colors].sort(() => Math.random() - 0.5)
}