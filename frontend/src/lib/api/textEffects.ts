/**
 * Text Effects Engine — 12 One-Click Presets + Curved/Warp Text
 * Generates SVG <filter> and <textPath> markup for Fabric canvas
 */
import type { FabricObject } from 'fabric'

export interface TextEffectPreset {
  id: string
  name: string
  category: 'glow' | 'outline' | '3d' | 'metallic' | 'border' | 'badge' | 'glitch' | 'shadow'
  description: string
  generateFilter: (textColor: string, options?: Record<string, unknown>) => string // Returns SVG <filter> markup
  generateStyles?: (textColor: string) => Partial<CSSStyleDeclaration> // Additional CSS styles
}

export interface CurvedTextOptions {
  curve: number        // -100 to 100 (percentage of semicircle)
  warp: 'none' | 'wave' | 'arch' | 'skew'
  waveAmplitude?: number
  waveFrequency?: number
  skewX?: number
  skewY?: number
  direction: 'ltr' | 'rtl'  // Critical for Arabic RTL
  letterSpacing?: number
  fontSize?: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'

// ============================================
// 12 TEXT EFFECT PRESETS
// ============================================

function makeFilter(id: string, content: string): string {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">${content}</filter>`
}

/** 1. Neon Glow â€” bright core + multi-layer colored outer glow */
export const NEON_GLOW: TextEffectPreset = {
  id: 'neon-glow',
  name: 'Neon Glow',
  category: 'glow',
  description: 'Bright core with animated multi-layer colored glow',
  generateFilter: (_textColor) => makeFilter('neon-glow', `
    <feGaussianBlur stdDeviation="3" result="blur1"/>
    <feGaussianBlur stdDeviation="6" result="blur2"/>
    <feGaussianBlur stdDeviation="12" result="blur3"/>
    <feGaussianBlur stdDeviation="24" result="blur4"/>
    <feMerge>
      <feMergeNode in="blur4"/>
      <feMergeNode in="blur3"/>
      <feMergeNode in="blur2"/>
      <feMergeNode in="blur1"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `),
  generateStyles: (textColor) => ({
    color: textColor,
    textShadow: `0 0 5px ${textColor}, 0 0 10px ${textColor}, 0 0 20px ${textColor}, 0 0 40px ${textColor}`,
  }),
}

/** 2. Hollow Outline â€” transparent fill + thick stroke */
export const HOLLOW_OUTLINE: TextEffectPreset = {
  id: 'hollow-outline',
  name: 'Hollow Outline',
  category: 'outline',
  description: 'Transparent fill with thick contrasting stroke',
  generateFilter: (textColor) => makeFilter('hollow-outline', `
    <feMorphology operator="dilate" radius="3" in="SourceAlpha" result="stroke"/>
    <feFlood flood-color="${textColor}" result="strokeColor"/>
    <feComposite in="strokeColor" in2="stroke" operator="in" result="coloredStroke"/>
    <feMerge>
      <feMergeNode in="coloredStroke"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `),
  generateStyles: (textColor) => ({
    color: 'transparent',
    webkitTextStroke: `3px ${textColor}`,
    textStroke: `3px ${textColor}`,
  }),
}

/** 3. Splice â€” offset fill + outline */
export const SPLICE: TextEffectPreset = {
  id: 'splice',
  name: 'Splice',
  category: 'outline',
  description: 'Offset fill with outline for cut-out effect',
  generateFilter: (_textColor) => makeFilter('splice', `
    <feMorphology operator="dilate" radius="2" in="SourceAlpha" result="outline"/>
    <feFlood flood-color="#ffffff" result="outlineColor"/>
    <feComposite in="outlineColor" in2="outline" operator="in" result="whiteOutline"/>
    <feOffset dx="2" dy="2" in="SourceGraphic" result="offsetFill"/>
    <feMerge>
      <feMergeNode in="whiteOutline"/>
      <feMergeNode in="offsetFill"/>
    </feMerge>
  `),
  generateStyles: (textColor) => ({
    color: textColor,
  }),
}

/** 4. 3D Extrude / Retro Stack â€” layered offset shadows */
export const RETRO_3D: TextEffectPreset = {
  id: 'retro-3d',
  name: '3D Extrude',
  category: '3d',
  description: 'Layered offset shadows for retro 3D extrusion',
  generateFilter: (_textColor) => makeFilter('retro-3d', `
    <feOffset dx="1" dy="1" in="SourceAlpha" result="shadow1"/>
    <feOffset dx="2" dy="2" in="SourceAlpha" result="shadow2"/>
    <feOffset dx="3" dy="3" in="SourceAlpha" result="shadow3"/>
    <feOffset dx="4" dy="4" in="SourceAlpha" result="shadow4"/>
    <feOffset dx="5" dy="5" in="SourceAlpha" result="shadow5"/>
    <feFlood flood-color="#222" result="shadowColor"/>
    <feComposite in="shadowColor" in2="shadow1" operator="in" result="s1"/>
    <feComposite in="shadowColor" in2="shadow2" operator="in" result="s2"/>
    <feComposite in="shadowColor" in2="shadow3" operator="in" result="s3"/>
    <feComposite in="shadowColor" in2="shadow4" operator="in" result="s4"/>
    <feComposite in="shadowColor" in2="shadow5" operator="in" result="s5"/>
    <feMerge>
      <feMergeNode in="s5"/>
      <feMergeNode in="s4"/>
      <feMergeNode in="s3"/>
      <feMergeNode in="s2"/>
      <feMergeNode in="s1"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `),
  generateStyles: (textColor) => ({
    color: textColor,
  }),
}

/** 5. Royal Gold Foil â€” metallic linear gradient fill + subtle dark drop shadow */
export const GOLD_FOIL: TextEffectPreset = {
  id: 'gold-foil',
  name: 'Royal Gold Foil',
  category: 'metallic',
  description: 'Metallic gold gradient with subtle emboss',
  generateFilter: (_textColor) => makeFilter('gold-foil', `
    <feGaussianBlur stdDeviation="1" in="SourceAlpha" result="shadow"/>
    <feOffset dx="1" dy="1" in="shadow" result="offsetShadow"/>
    <feFlood flood-color="#1a1a2e" flood-opacity="0.3" result="shadowColor"/>
    <feComposite in="shadowColor" in2="offsetShadow" operator="in" result="coloredShadow"/>
    <feMerge>
      <feMergeNode in="coloredShadow"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `),
  generateStyles: (_textColor) => ({
    background: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 25%, #ffd700 50%, #b8860b 75%, #8b6914 100%)',
    backgroundClip: 'text',
    webkitBackgroundClip: 'text',
    color: 'transparent',
    textShadow: '1px 1px 2px rgba(26,26,46,0.3)',
  }),
}

/** 6. Sticker Text â€” thick white outer contour border + drop shadow */
export const STICKER_TEXT: TextEffectPreset = {
  id: 'sticker-text',
  name: 'Sticker Text',
  category: 'border',
  description: 'Thick white contour border with drop shadow',
  generateFilter: (_textColor) => makeFilter('sticker-text', `
    <feMorphology operator="dilate" radius="6" in="SourceAlpha" result="stroke"/>
    <feFlood flood-color="#ffffff" result="strokeColor"/>
    <feComposite in="strokeColor" in2="stroke" operator="in" result="whiteStroke"/>
    <feDropShadow dx="3" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.4" result="dropShadow"/>
    <feMerge>
      <feMergeNode in="dropShadow"/>
      <feMergeNode in="whiteStroke"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `),
  generateStyles: (textColor) => ({
    color: textColor,
  }),
}

/** 7. Pill Badge â€” rounded background box behind text */
export const PILL_BADGE: TextEffectPreset = {
  id: 'pill-badge',
  name: 'Pill Badge',
  category: 'badge',
  description: 'Rounded background box with padding',
  generateFilter: (textColor) => makeFilter('pill-badge', `
    <feMorphology operator="dilate" radius="12" in="SourceAlpha" result="bg"/>
    <feFlood flood-color="${textColor}" result="bgColor"/>
    <feComposite in="bgColor" in2="bg" operator="in" result="coloredBg"/>
    <feGaussianBlur stdDeviation="1" in="coloredBg" result="softBg"/>
    <feMerge>
      <feMergeNode in="softBg"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `),
  generateStyles: (textColor) => ({
    color: '#ffffff',
    padding: '4px 16px',
    borderRadius: '9999px',
    backgroundColor: textColor,
  }),
}

/** 7.5 Embroidered Patch â€” thick thread-like border with fabric texture */
export const EMBROIDERED_PATCH: TextEffectPreset = {
  id: 'embroidered-patch',
  name: 'Embroidered Patch',
  category: 'badge',
  description: 'Fabric patch with thread border and texture',
  generateFilter: (_textColor) => makeFilter('embroidered-patch', `
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise"/>
    <feColorMatrix in="noise" type="saturate" values="0" result="bwNoise"/>
    <feMorphology operator="dilate" radius="8" in="SourceAlpha" result="border"/>
    <feFlood flood-color="#ffffff" result="threadColor"/>
    <feComposite in="threadColor" in2="border" operator="in" result="whiteThread"/>
    <feBlend in="whiteThread" in2="bwNoise" mode="multiply" result="texturedThread"/>
    <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.3" result="shadow"/>
    <feMerge>
      <feMergeNode in="shadow"/>
      <feMergeNode in="texturedThread"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `),
  generateStyles: (textColor) => ({
    color: textColor,
    padding: '6px 14px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.1)',
  }),
}

/** 8. Glitch â€” cyan/magenta dual offset shadows */
export const GLITCH: TextEffectPreset = {
  id: 'glitch',
  name: 'Glitch',
  category: 'glitch',
  description: 'Cyan/magenta RGB split glitch effect',
  generateFilter: (_textColor) => makeFilter('glitch', `
    <feOffset dx="-2" dy="0" in="SourceGraphic" result="cyanLayer"/>
    <feColorMatrix in="cyanLayer" type="matrix" values="0 0 0 0 0  1 1 1 0 0  0 0 0 0 0  0 0 0 1 0" result="cyan"/>
    <feOffset dx="2" dy="0" in="SourceGraphic" result="magentaLayer"/>
    <feColorMatrix in="magentaLayer" type="matrix" values="1 1 1 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="magenta"/>
    <feMerge>
      <feMergeNode in="cyan"/>
      <feMergeNode in="magenta"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `),
  generateStyles: (textColor) => ({
    color: textColor,
  }),
}

/** 9. Lift â€” soft ambient shadow */
export const LIFT: TextEffectPreset = {
  id: 'lift',
  name: 'Lift',
  category: 'shadow',
  description: 'Soft ambient shadow for lifted appearance',
  generateFilter: (_textColor) => makeFilter('lift', `
    <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.15"/>
  `),
  generateStyles: (textColor) => ({
    color: textColor,
  }),
}

/** 10. Echo â€” fading duplicate shadows */
export const ECHO: TextEffectPreset = {
  id: 'echo',
  name: 'Echo',
  category: 'shadow',
  description: 'Fading duplicate shadows trailing behind',
  generateFilter: (textColor) => makeFilter('echo', `
    <feOffset dx="3" dy="3" in="SourceAlpha" result="s1"/>
    <feOffset dx="6" dy="6" in="SourceAlpha" result="s2"/>
    <feOffset dx="9" dy="9" in="SourceAlpha" result="s3"/>
    <feFlood flood-color="${textColor}" flood-opacity="0.4" result="c1"/>
    <feFlood flood-color="${textColor}" flood-opacity="0.25" result="c2"/>
    <feFlood flood-color="${textColor}" flood-opacity="0.1" result="c3"/>
    <feComposite in="c1" in2="s1" operator="in" result="e1"/>
    <feComposite in="c2" in2="s2" operator="in" result="e2"/>
    <feComposite in="c3" in2="s3" operator="in" result="e3"/>
    <feMerge>
      <feMergeNode in="e3"/>
      <feMergeNode in="e2"/>
      <feMergeNode in="e1"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `),
  generateStyles: (textColor) => ({
    color: textColor,
  }),
}

/** 11. Chrome â€” mirror-like reflective surface */
export const CHROME: TextEffectPreset = {
  id: 'chrome',
  name: 'Chrome',
  category: 'metallic',
  description: 'Mirror-like chrome reflective surface',
  generateFilter: (_textColor) => makeFilter('chrome', `
    <feGaussianBlur stdDeviation="0.5" in="SourceAlpha" result="blur"/>
    <feSpecularLighting surfaceScale="5" specularConstant="1" specularExponent="20" lighting-color="#ffffff" result="specOut">
      <fePointLight x="50" y="-100" z="200"/>
    </feSpecularLighting>
    <feComposite in="specOut" in2="SourceAlpha" operator="in" result="spec"/>
    <feComposite in="SourceGraphic" in2="spec" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit"/>
    <feMerge>
      <feMergeNode in="lit"/>
    </feMerge>
  `),
  generateStyles: (_textColor) => ({
    background: 'linear-gradient(180deg, #fff 0%, #ccc 50%, #fff 100%)',
    backgroundClip: 'text',
    webkitBackgroundClip: 'text',
    color: 'transparent',
  }),
}

/** 12. Paper Cut â€” layered paper cutout effect */
export const PAPER_CUT: TextEffectPreset = {
  id: 'paper-cut',
  name: 'Paper Cut',
  category: '3d',
  description: 'Layered paper cutout with depth shadows',
  generateFilter: (_textColor) => makeFilter('paper-cut', `
    <feOffset dx="2" dy="2" in="SourceAlpha" result="s1"/>
    <feOffset dx="4" dy="4" in="SourceAlpha" result="s2"/>
    <feOffset dx="6" dy="6" in="SourceAlpha" result="s3"/>
    <feGaussianBlur stdDeviation="2" in="s1" result="b1"/>
    <feGaussianBlur stdDeviation="4" in="s2" result="b2"/>
    <feGaussianBlur stdDeviation="6" in="s3" result="b3"/>
    <feFlood flood-color="#000" flood-opacity="0.2" result="c1"/>
    <feFlood flood-color="#000" flood-opacity="0.15" result="c2"/>
    <feFlood flood-color="#000" flood-opacity="0.1" result="c3"/>
    <feComposite in="c1" in2="b1" operator="in" result="l1"/>
    <feComposite in="c2" in2="b2" operator="in" result="l2"/>
    <feComposite in="c3" in2="b3" operator="in" result="l3"/>
    <feMerge>
      <feMergeNode in="l3"/>
      <feMergeNode in="l2"/>
      <feMergeNode in="l1"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `),
  generateStyles: (textColor) => ({
    color: textColor,
  }),
}

/** ALL PRESETS */
export const TEXT_EFFECT_PRESETS: TextEffectPreset[] = [
  NEON_GLOW,
  HOLLOW_OUTLINE,
  SPLICE,
  RETRO_3D,
  GOLD_FOIL,
  STICKER_TEXT,
  PILL_BADGE,
  EMBROIDERED_PATCH,
  GLITCH,
  LIFT,
  ECHO,
  CHROME,
  PAPER_CUT,
]

/** Get preset by ID */
export function getTextEffectPreset(id: string): TextEffectPreset | undefined {
  return TEXT_EFFECT_PRESETS.find(p => p.id === id)
}

/** Apply text effect preset to a Fabric text object */
export function applyTextEffect(
  textObj: FabricObject,  // Fabric.Textbox
  preset: TextEffectPreset,
  textColor: string
): void {
  const filterMarkup = preset.generateFilter(textColor)
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<svg>${filterMarkup}</svg>`, 'image/svg+xml')
  const filterEl = doc.querySelector('filter')
  
  if (filterEl) {
    // Assign unique ID
    const filterId = `effect-${preset.id}-${Date.now()}`
    filterEl.setAttribute('id', filterId)
    
    // Add to document defs if not exists
    let defs = document.querySelector('svg > defs')
    if (!defs) {
      const svg = document.createElementNS(SVG_NS, 'svg')
      svg.style.display = 'none'
      defs = document.createElementNS(SVG_NS, 'defs')
      svg.appendChild(defs)
      document.body.appendChild(svg)
    }
    defs.appendChild(filterEl)
    
    // Apply to Fabric object
    textObj.set('shadow', null)
    textObj.set('filter', `url(#${filterId})`)
    
    // Apply additional CSS styles
    if (preset.generateStyles) {
      const styles = preset.generateStyles(textColor)
      Object.assign(textObj, styles)
    }
  }
}

// ============================================
// CURVED / WARPED TEXT ENGINE (Arabic RTL aware)
// ============================================

/** Generate SVG <textPath> for curved text */
export function generateCurvedTextPath(
  text: string,
  options: CurvedTextOptions
): { path: string; textPathAttrs: Record<string, string>; transform?: string } {
  const { curve, warp, direction, fontSize = 48 } = options
  const isRTL = direction === 'rtl'
  
  // Base path for curve (semicircle)
  const radius = Math.max(100, text.length * fontSize * 0.5)
  const curveAmount = curve / 100  // -1 to 1
  
  let path = ''
  const textPathAttrs: Record<string, string> = {
    startOffset: isRTL ? '100%' : '0%',
    method: 'align',
    spacing: 'auto',
  }
  let transform = ''
  
  if (Math.abs(curve) < 5) {
    // Straight line with optional warp
    const width = text.length * fontSize * 0.6
    path = `M 0 0 L ${width} 0`
    
    if (warp === 'wave') {
      const amp = options.waveAmplitude || fontSize * 0.15
      const freq = options.waveFrequency || 0.02
      let wavePath = `M 0 0`
      for (let x = 0; x <= width; x += 2) {
        const y = Math.sin(x * freq) * amp
        wavePath += ` L ${x} ${y}`
      }
      path = wavePath
    } else if (warp === 'arch') {
      const height = fontSize * 0.5
      path = `M 0 0 Q ${width/2} ${-height} ${width} 0`
    } else if (warp === 'skew') {
      const skewX = options.skewX || 0
      const skewY = options.skewY || 0
      transform = `skewX(${skewX}) skewY(${skewY})`
    }
  } else {
    // Curved path (arc)
    const angle = Math.PI * Math.abs(curveAmount)
    const sweepFlag = curveAmount > 0 ? 0 : 1
    const xRadius = radius
    const yRadius = radius
    
    if (isRTL) {
      // RTL: arc from right to left
      const startX = radius
      const startY = 0
      const endX = radius * Math.cos(angle)
      const endY = radius * Math.sin(angle) * (curveAmount > 0 ? 1 : -1)
      path = `M ${startX} ${startY} A ${xRadius} ${yRadius} 0 0 ${sweepFlag} ${endX} ${endY}`
      textPathAttrs.startOffset = '0%'
    } else {
      // LTR: arc from left to right
      const startX = -radius
      const startY = 0
      const endX = -radius * Math.cos(angle)
      const endY = radius * Math.sin(angle) * (curveAmount > 0 ? 1 : -1)
      path = `M ${startX} ${startY} A ${xRadius} ${yRadius} 0 0 ${sweepFlag} ${endX} ${endY}`
      textPathAttrs.startOffset = '0%'
    }
    
    // Apply warp on top of curve
    if (warp === 'wave') {
      // Wave distortion would need more complex path manipulation
      // For now, keep simple arc
    }
  }
  
  return { path, textPathAttrs, transform }
}

/** Generate complete SVG for curved text */
export function generateCurvedTextSVG(
  text: string,
  options: CurvedTextOptions,
  fontFamily: string,
  fontSize: number,
  fill: string,
  fontWeight: string = '400'
): string {
  const { path, textPathAttrs, transform } = generateCurvedTextPath(text, { ...options, fontSize })
  const isRTL = options.direction === 'rtl'
  
  // For Arabic RTL, we need to handle text direction properly
  const dirAttr = isRTL ? ' direction="rtl" unicode-bidi="bidi-override"' : ''
  
  return `<svg xmlns="${SVG_NS}" width="100%" height="100%" viewBox="0 0 400 200">
  <defs>
    <path id="text-curve-path" d="${path}"/>
  </defs>
  <text font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}"${dirAttr} ${transform ? `transform="${transform}"` : ''}>
    <textPath href="#text-curve-path" ${Object.entries(textPathAttrs).map(([k, v]) => `${k}="${v}"`).join(' ')}>${text}</textPath>
  </text>
</svg>`
}

/** Convert curved text SVG to Fabric-compatible object */
export async function createCurvedTextObject(
  text: string,
  options: CurvedTextOptions,
  fontFamily: string,
  fontSize: number,
  fill: string,
  fontWeight: string = '400'
): Promise<string> {
  const svg = generateCurvedTextSVG(text, options, fontFamily, fontSize, fill, fontWeight)
  return svg
}

/** Parameters of a live Fabric text object that curved text needs. */
interface CurvedTextTarget {
  text: string
  fontFamily: string
  fontSize: number
  fill: string
  fontWeight?: string
  set: (key: string, value: unknown) => void
}

/** Helper: Apply curved text to existing Fabric text object */
export async function applyCurveToText(
  textObj: CurvedTextTarget,  // Fabric.Textbox
  curve: number,
  warp: CurvedTextOptions['warp'] = 'none',
  direction: 'ltr' | 'rtl' = 'ltr',
  extraOptions: Partial<CurvedTextOptions> = {}
): Promise<void> {
  const svg = await createCurvedTextObject(
    textObj.text,
    { curve, warp, direction, ...extraOptions },
    textObj.fontFamily,
    textObj.fontSize,
    textObj.fill,
    textObj.fontWeight
  )
  
  // Replace with SVG-based curved text
  // This would typically involve creating a Fabric.Group from the SVG
  textObj.set('curvedText', { svg, curve, warp, direction })
}
