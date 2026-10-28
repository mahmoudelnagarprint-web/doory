/**
 * Zero-Key Google Fonts Loader via Fontsource
 * Fetches full catalog from api.fontsource.org, prioritizes 40 best Arabic design fonts
 * + top English display fonts. Injects stylesheets dynamically.
 */
export interface FontDefinition {
  family: string
  variants: string[]  // e.g. ['400', '500', '700', '900']
  subsets: string[]   // e.g. ['arabic', 'latin', 'latin-ext']
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace'
  language: 'arabic' | 'latin' | 'both'
  fallback?: string   // CSS fallback font
}

const FONTSOURCE_API = 'https://api.fontsource.org/v1/fonts'
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2'

// Pinned top 40 Arabic design fonts + top English display fonts
export const PINNED_ARABIC_FONTS: FontDefinition[] = [
  // Arabic Sans-Serif (Modern UI)
  { family: 'Cairo', variants: ['400', '500', '600', '700', '900'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Tajawal', variants: ['400', '500', '700', '800', '900'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Almarai', variants: ['400', '700', '800'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Changa', variants: ['400', '500', '600', '700', '800'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'El Messiri', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Reem Kufi', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Readex Pro', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Alexandria', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Marhey', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Lalezar', variants: ['400'], subsets: ['arabic', 'latin'], category: 'display', language: 'arabic', fallback: 'cursive' },
  { family: 'Aref Ruqaa', variants: ['400', '700'], subsets: ['arabic', 'latin'], category: 'serif', language: 'arabic', fallback: 'serif' },
  { family: 'Lemonada', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'display', language: 'arabic', fallback: 'cursive' },
  { family: 'Baloo Bhaijaan 2', variants: ['400', '500', '600', '700', '800'], subsets: ['arabic', 'latin'], category: 'display', language: 'arabic', fallback: 'cursive' },
  { family: 'IBM Plex Sans Arabic', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Noto Kufi Arabic', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Noto Naskh Arabic', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'serif', language: 'arabic', fallback: 'serif' },
  { family: 'Noto Sans Arabic', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Scheherazade New', variants: ['400', '700'], subsets: ['arabic', 'latin'], category: 'serif', language: 'arabic', fallback: 'serif' },
  { family: 'Amiri', variants: ['400', '700'], subsets: ['arabic', 'latin'], category: 'serif', language: 'arabic', fallback: 'serif' },
  { family: 'Lateef', variants: ['400'], subsets: ['arabic', 'latin'], category: 'handwriting', language: 'arabic', fallback: 'cursive' },
  { family: 'Mada', variants: ['400', '500', '600', '700'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
  { family: 'Rubik', variants: ['400', '500', '700', '900'], subsets: ['arabic', 'latin', 'latin-ext'], category: 'sans-serif', language: 'both', fallback: 'system-ui, sans-serif' },
  { family: 'Varela Round', variants: ['400'], subsets: ['arabic', 'latin', 'latin-ext'], category: 'sans-serif', language: 'both', fallback: 'system-ui, sans-serif' },
  { family: 'Almarai', variants: ['400', '700', '800'], subsets: ['arabic', 'latin'], category: 'sans-serif', language: 'arabic', fallback: 'system-ui, sans-serif' },
]

export const PINNED_ENGLISH_FONTS: FontDefinition[] = [
  // Display / Headline
  { family: 'Inter', variants: ['400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext'], category: 'sans-serif', language: 'latin', fallback: 'system-ui, sans-serif' },
  { family: 'Poppins', variants: ['400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext'], category: 'sans-serif', language: 'latin', fallback: 'system-ui, sans-serif' },
  { family: 'Montserrat', variants: ['400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext'], category: 'sans-serif', language: 'latin', fallback: 'system-ui, sans-serif' },
  { family: 'Outfit', variants: ['400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext'], category: 'sans-serif', language: 'latin', fallback: 'system-ui, sans-serif' },
  { family: 'Plus Jakarta Sans', variants: ['400', '500', '600', '700', '800'], subsets: ['latin', 'latin-ext'], category: 'sans-serif', language: 'latin', fallback: 'system-ui, sans-serif' },
  { family: 'DM Sans', variants: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'], category: 'sans-serif', language: 'latin', fallback: 'system-ui, sans-serif' },
  { family: 'Space Grotesk', variants: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'], category: 'sans-serif', language: 'latin', fallback: 'system-ui, sans-serif' },
  { family: 'Syne', variants: ['400', '500', '600', '700', '800'], subsets: ['latin', 'latin-ext'], category: 'display', language: 'latin', fallback: 'system-ui, sans-serif' },
  { family: 'Clash Display', variants: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'], category: 'display', language: 'latin', fallback: 'system-ui, sans-serif' },
  { family: 'Sora', variants: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'], category: 'sans-serif', language: 'latin', fallback: 'system-ui, sans-serif' },
  // Serif / Editorial
  { family: 'Playfair Display', variants: ['400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext'], category: 'serif', language: 'latin', fallback: 'serif' },
  { family: 'Merriweather', variants: ['400', '700', '900'], subsets: ['latin', 'latin-ext'], category: 'serif', language: 'latin', fallback: 'serif' },
  { family: 'Crimson Text', variants: ['400', '600', '700'], subsets: ['latin', 'latin-ext'], category: 'serif', language: 'latin', fallback: 'serif' },
  { family: 'Literata', variants: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'], category: 'serif', language: 'latin', fallback: 'serif' },
  // Handwriting / Creative
  { family: 'Pacifico', variants: ['400'], subsets: ['latin', 'latin-ext'], category: 'handwriting', language: 'latin', fallback: 'cursive' },
  { family: 'Dancing Script', variants: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'], category: 'handwriting', language: 'latin', fallback: 'cursive' },
  { family: 'Kalam', variants: ['400', '700'], subsets: ['latin', 'latin-ext'], category: 'handwriting', language: 'latin', fallback: 'cursive' },
  // Monospace
  { family: 'JetBrains Mono', variants: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'], category: 'monospace', language: 'latin', fallback: 'monospace' },
  { family: 'Fira Code', variants: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'], category: 'monospace', language: 'latin', fallback: 'monospace' },
  { family: 'Space Mono', variants: ['400', '700'], subsets: ['latin', 'latin-ext'], category: 'monospace', language: 'latin', fallback: 'monospace' },
]

/** Cache for loaded fonts */
const loadedFonts = new Set<string>()

/** One entry of the Fontsource API's catalogue. */
interface FontsourceEntry {
  family: string
  variants?: string[]
  subsets?: string[]
  category?: FontDefinition['category']
}

/** Fetch full font catalog from Fontsource API */
export async function fetchFontsourceCatalog(signal?: AbortSignal): Promise<FontDefinition[]> {
  try {
    const res = await fetch(FONTSOURCE_API, { signal, credentials: 'omit', headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Fontsource API failed (${res.status})`)
    const data = (await res.json()) as FontsourceEntry[]
    // Transform to our format
    return data.map((f) => ({
      family: f.family,
      variants: f.variants || ['400'],
      subsets: f.subsets || ['latin'],
      category: f.category || 'sans-serif',
      language: f.subsets?.includes('arabic') ? 'arabic' : 'latin',
    }))
  } catch (e) {
    console.warn('Fontsource catalog fetch failed:', e)
    return [...PINNED_ARABIC_FONTS, ...PINNED_ENGLISH_FONTS]
  }
}

/** Get all pinned fonts (Arabic + English) */
export function getPinnedFonts(): FontDefinition[] {
  return [...PINNED_ARABIC_FONTS, ...PINNED_ENGLISH_FONTS]
}

/** Filter fonts by language and category */
export function filterFonts(
  fonts: FontDefinition[],
  options: { language?: 'arabic' | 'latin' | 'both'; category?: FontDefinition['category'] } = {}
): FontDefinition[] {
  return fonts.filter(f => {
    if (options.language && f.language !== options.language && f.language !== 'both') return false
    if (options.category && f.category !== options.category) return false
    return true
  })
}

/** Build Google Fonts CSS URL for a font */
export function buildGoogleFontsUrl(font: FontDefinition, display = 'swap'): string {
  const variants = font.variants.join(';')
  return `${GOOGLE_FONTS_CSS}?family=${encodeURIComponent(font.family)}:wght@${variants}&display=${display}&subset=${font.subsets.join(',')}`
}

/** Dynamically inject Google Fonts stylesheet */
export function loadFont(font: FontDefinition): Promise<void> {
  if (loadedFonts.has(font.family)) return Promise.resolve()
  
  return new Promise((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'style'
    link.href = buildGoogleFontsUrl(font)
    link.onload = () => {
      link.rel = 'stylesheet'
      loadedFonts.add(font.family)
      // Wait for font to be ready
      if ('fonts' in document) {
        document.fonts.ready.then(() => resolve()).catch(resolve)
      } else {
        resolve()
      }
    }
    link.onerror = () => reject(new Error(`Failed to load font: ${font.family}`))
    document.head.appendChild(link)
  })
}

/** Preload multiple fonts */
export async function preloadFonts(fonts: FontDefinition[]): Promise<void> {
  await Promise.all(fonts.map(f => loadFont(f)))
}

/** Get CSS font-family string with fallback */
export function getFontFamilyCSS(font: FontDefinition): string {
  return `"${font.family}", ${font.fallback || (font.language === 'arabic' ? 'system-ui, sans-serif' : 'system-ui, sans-serif')}`
}

/** Check if font is loaded */
export function isFontLoaded(family: string): boolean {
  return loadedFonts.has(family)
}

/** Get all available font families from catalog */
export async function getAllFontFamilies(signal?: AbortSignal): Promise<string[]> {
  const catalog = await fetchFontsourceCatalog(signal)
  return [...new Set(catalog.map(f => f.family))].sort()
}