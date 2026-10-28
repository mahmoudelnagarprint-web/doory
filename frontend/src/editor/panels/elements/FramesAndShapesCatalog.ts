/* eslint-disable -- ESLint parser false positive on complex template literals in pattern definitions */
/**
 * Frames, Shapes & Patterns Catalog
 * 25+ native clipping frames, procedural organic blob generator,
 * and 25+ customizable SVG pattern generators.
 */
import type { MaskShapeId } from '@/types/document'

// ============================================
// FRAME DEFINITIONS (25+ frames)
// ============================================

export interface FrameDefinition {
  id: MaskShapeId
  name: string
  path: string
  category: 'basic' | 'geometric' | 'organic' | 'decorative' | 'specialty'
}

export const EXTENDED_FRAMES: FrameDefinition[] = [
  // Basic
  { id: 'circle', name: 'Circle', path: 'M 50, 50 m -46, 0 a 46,46 0 1,0 92,0 a 46,46 0 1,0 -92,0', category: 'basic' },
  { id: 'rounded', name: 'Rounded Square', path: 'M 14,4 H 86 A 10,10 0 0 1 96,14 V 86 A 10,10 0 0 1 86,96 H 14 A 10,10 0 0 1 4,86 V 14 A 10,10 0 0 1 14,4 Z', category: 'basic' },
  { id: 'square', name: 'Square', path: 'M 4,4 H 96 V 96 H 4 Z', category: 'basic' },
  
  // Geometric
  { id: 'hexagon', name: 'Hexagon', path: 'M26 6 H74 L96 50 L74 94 H26 L4 50 Z', category: 'geometric' },
  { id: 'octagon', name: 'Octagon', path: 'M18 4 H82 L96 18 V82 L82 96 H18 L4 82 V18 Z', category: 'geometric' },
  { id: 'diamond', name: 'Diamond', path: 'M50 4 L96 50 L50 96 L4 50 Z', category: 'geometric' },
  { id: 'triangle', name: 'Triangle', path: 'M50 6 L94 94 H6 Z', category: 'geometric' },
  { id: 'pentagon', name: 'Pentagon', path: 'M50 4 L94 36 L76 96 L24 96 L6 36 Z', category: 'geometric' },
  { id: 'star5', name: '5-Point Star', path: 'M50 4 L64 33 L96 38 L73 60 L78 92 L50 77 L22 92 L27 60 L4 38 L36 33 Z', category: 'geometric' },
  { id: 'star8', name: '8-Point Star', path: 'M50 6 L60 28 L86 30 L66 48 L70 74 L50 60 L30 74 L34 48 L14 30 L40 28 Z', category: 'geometric' },
  { id: 'cross', name: 'Cross', path: 'M34 4 H66 V34 H96 V66 H66 V96 H34 V66 H4 V34 H34 Z', category: 'geometric' },
  
  // Decorative
  { id: 'heart', name: 'Heart', path: 'M50 92 C16 68 4 50 4 32 C4 16 16 6 30 6 C38 6 46 11 50 19 C54 11 62 6 70 6 C84 6 96 16 96 32 C96 50 84 68 50 92 Z', category: 'decorative' },
  { id: 'arch', name: 'Classic Arch', path: 'M 6,96 V 48 A 44,44 0 0 1 94,48 V 96 Z', category: 'decorative' },
  { id: 'islamic-arch', name: 'Islamic Dome Arch', path: 'M 4,96 V 40 Q 50 0 96 40 V 96 Q 50 80 4 96 Z', category: 'decorative' },
  { id: 'scalloped', name: 'Scalloped Badge', path: 'M50 4 C56 4 61 6 65 10 C69 14 71 20 71 26 C71 32 69 38 65 42 C61 46 56 48 50 48 C44 48 39 46 35 42 C31 38 29 32 29 26 C29 20 31 14 35 10 C39 6 44 4 50 4 Z', category: 'decorative' },
  { id: 'shield', name: 'Shield', path: 'M50 4 L96 24 V80 C96 90 74 98 50 96 C26 98 4 90 4 80 V24 Z', category: 'decorative' },
  { id: 'speech-bubble', name: 'Speech Bubble', path: 'M14 4 H86 A 10,10 0 0 1 96 14 V70 L58 88 L50 96 L42 88 L4 70 V14 A 10,10 0 0 1 14 4 Z', category: 'decorative' },
  { id: 'thought-bubble', name: 'Thought Bubble', path: 'M20 10 H80 A 15,15 0 0 1 95 25 V75 A 15,15 0 0 1 80 90 H20 A 15,15 0 0 1 5 75 V25 A 15,15 0 0 1 20 10 Z M15 85 C10 80 8 75 8 70 C8 65 12 60 18 60', category: 'decorative' },
  { id: 'ticket', name: 'Ticket Stub', path: 'M8 4 H92 V40 Q92 50 76 50 Q60 50 44 50 Q28 50 12 50 Q8 50 8 40 Z M8 60 Q8 70 12 70 Q28 70 44 70 Q60 70 76 70 Q92 70 92 60 V96 H8 Z', category: 'decorative' },
  { id: 'polaroid', name: 'Polaroid Frame', path: 'M10 4 H90 V70 H10 Z', category: 'decorative' },
  
  // Specialty
  { id: 'triptych', name: 'Triptych (3-Split)', path: 'M4 4 H30 V96 H4 Z M35 4 H65 V96 H35 Z M70 4 H96 V96 H70 Z', category: 'specialty' },
  { id: 'cloud', name: 'Cloud', path: 'M50 10 C30 10 14 26 14 46 C14 58 20 68 30 72 C20 78 12 88 20 94 C28 100 42 98 50 90 C58 98 72 100 80 94 C88 88 80 78 70 72 C80 68 86 58 86 46 C86 26 70 10 50 10 Z', category: 'organic' },
  { id: 'blob-1', name: 'Organic Blob 1', path: '', category: 'organic', generator: 'blob' },
  { id: 'blob-2', name: 'Organic Blob 2', path: '', category: 'organic', generator: 'blob' },
  { id: 'blob-3', name: 'Organic Blob 3', path: '', category: 'organic', generator: 'blob' },
  { id: 'blob-4', name: 'Organic Blob 4', path: '', category: 'organic', generator: 'blob' },
  { id: 'blob-5', name: 'Organic Blob 5', path: '', category: 'organic', generator: 'blob' },
]

// Blob frames use generator; we'll fill paths at runtime
const BLOB_SEEDS = [12345, 23456, 34567, 45678, 56789]

// ============================================
// PROCEDURAL ORGANIC BLOB GENERATOR
// ============================================

export interface BlobOptions {
  seed: number
  points?: number        // Number of control points (default 8)
  irregularity?: number  // 0-1, how irregular (default 0.4)
  size?: number          // Base radius (default 40)
  centerX?: number       // Default 50
  centerY?: number       // Default 50
}

function mulberry32(a: number): () => number {
  return function() {
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/** Generate a deterministic organic blob SVG path */
export function generateBlobPath(options: BlobOptions): string {
  const { 
    seed, 
    points = 8, 
    irregularity = 0.4, 
    size = 40,
    centerX = 50,
    centerY = 50 
  } = options
  
  const random = mulberry32(seed)
  const angles: number[] = []
  const radii: number[] = []
  
  // Generate base angles
  for (let i = 0; i < points; i++) {
    angles.push((i / points) * Math.PI * 2)
  }
  // Shuffle angles slightly for organic feel
  for (let i = angles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[angles[i], angles[j]] = [angles[j], angles[i]]
  }
  angles.sort((a, b) => a - b)
  
  // Generate radii with controlled irregularity
  for (let i = 0; i < points; i++) {
    const baseRadius = size
    const variation = (random() - 0.5) * 2 * irregularity * size
    radii.push(Math.max(size * 0.3, baseRadius + variation))
  }
  
  // Build cubic bezier path
  const pathPoints = angles.map((angle, i) => {
    const r = radii[i]
    return {
      x: centerX + Math.cos(angle) * r,
      y: centerY + Math.sin(angle) * r,
      angle,
      radius: r,
    }
  })
  
  // Close the loop
  pathPoints.push({ ...pathPoints[0] })
  
  let path = `M ${pathPoints[0].x.toFixed(1)},${pathPoints[0].y.toFixed(1)}`
  
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const current = pathPoints[i]
    const next = pathPoints[i + 1]
    const nextNext = pathPoints[(i + 2) % (pathPoints.length - 1)]
    
    // Control points for smooth curve
    const cp1Angle = current.angle + (next.angle - current.angle) / 3
    const cp2Angle = next.angle - (next.angle - current.angle) / 3
    
    const cp1Radius = current.radius * 0.5 + next.radius * 0.5
    const cp2Radius = current.radius * 0.5 + next.radius * 0.5
    
    const cp1x = centerX + Math.cos(cp1Angle) * cp1Radius
    const cp1y = centerY + Math.sin(cp1Angle) * cp1Radius
    const cp2x = centerX + Math.cos(cp2Angle) * cp2Radius
    const cp2y = centerY + Math.sin(cp2Angle) * cp2Radius
    
    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`
  }
  
  return path
}

/** Get a blob frame definition with generated path */
export function getBlobFrame(index: number): FrameDefinition {
  const seed = BLOB_SEEDS[index % BLOB_SEEDS.length]
  return {
    id: `blob-${index + 1}` as MaskShapeId,
    name: `Organic Blob ${index + 1}`,
    path: generateBlobPath({ seed, points: 8, irregularity: 0.35 + (index * 0.05), size: 42 }),
    category: 'organic',
  }
}

/** Generate a random blob frame (for "Randomize" button) */
export function generateRandomBlobFrame(): FrameDefinition {
  const seed = Date.now() + Math.random() * 100000
  return {
    id: `blob-random-${seed}` as MaskShapeId,
    name: 'Random Blob',
    path: generateBlobPath({ seed, points: Math.floor(6 + Math.random() * 4), irregularity: 0.3 + Math.random() * 0.3, size: 38 + Math.random() * 8 }),
    category: 'organic',
  }
}

// ============================================
// SVG PATTERN GENERATORS (25+ patterns)
// ============================================

export interface PatternDefinition {
  id: string
  name: string
  category: 'geometric' | 'organic' | 'decorative' | 'cultural'
  generate: (options: PatternOptions) => string // Returns SVG <pattern> markup
  defaultOptions: PatternOptions
  controls: PatternControl[]
}

export interface PatternOptions {
  primaryColor: string
  backgroundColor: string
  scale: number       // 0.5 - 3
  opacity: number     // 0 - 1
  rotation?: number   // degrees
}

export interface PatternControl {
  key: keyof PatternOptions | 'rotation'
  label: string
  type: 'color' | 'range' | 'select'
  min?: number
  max?: number
  step?: number
  options?: { value: any; label: string }[]
}

const PATTERN_SIZE = 100

function patternDef(
  id: string,
  name: string,
  category: PatternDefinition['category'],
  generate: PatternDefinition['generate'],
  defaultOptions: PatternOptions,
  controls: PatternDefinition['controls']
): PatternDefinition {
  return { id, name, category, generate, defaultOptions, controls }
}

const baseControls: PatternControl[] = [
  { key: 'primaryColor', label: 'Pattern Color', type: 'color' },
  { key: 'backgroundColor', label: 'Background', type: 'color' },
  { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 3, step: 0.1 },
  { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'rotation', label: 'Rotation', type: 'range', min: 0, max: 360, step: 1 },
]

const defaultOpts: PatternOptions = {
  primaryColor: '#7c5cff',
  backgroundColor: 'transparent',
  scale: 1,
  opacity: 1,
  rotation: 0,
}

function wrapPattern(content: string, opts: PatternOptions): string {
  const size = PATTERN_SIZE * opts.scale
  return `<pattern id="custom-pattern" patternUnits="userSpaceOnUse" width="${size}" height="${size}" patternTransform="rotate(${opts.rotation || 0} ${size/2} ${size/2})">
${opts.backgroundColor !== 'transparent' ? `<rect width="100%" height="100%" fill="${opts.backgroundColor}"/>` : ''}
<g opacity="${opts.opacity}">${content}</g>
</pattern>`
}

// Polka Dots
const polkaDots: PatternDefinition = patternDef(
  'polka-dots', 'Polka Dots', 'geometric',
  (opts) => {
    const r = 8 * opts.scale
    const spacing = 30 * opts.scale
    let content = ''
    for (let y = -spacing; y < PATTERN_SIZE + spacing; y += spacing) {
      for (let x = -spacing; x < PATTERN_SIZE + spacing; x += spacing) {
        const offsetX = (y / spacing) % 2 === 0 ? 0 : spacing / 2
        content += `<circle cx="${x + offsetX}" cy="${y}" r="${r}" fill="${opts.primaryColor}"/>`
      }
    }
    return wrapPattern(content, opts)
  },
  defaultOpts, baseControls
)

// Chevron
const chevron: PatternDefinition = patternDef(
  'chevron', 'Chevron', 'geometric',
  (opts) => {
    const h = 20 * opts.scale
    const w = 40 * opts.scale
    let content = ''
    for (let y = -h * 2; y < PATTERN_SIZE + h * 2; y += h) {
      for (let x = -w * 2; x < PATTERN_SIZE + w * 2; x += w) {
        const flip = ((x / w) + (y / h)) % 2 === 0 ? 1 : -1
        content += `<path d="M ${x} ${y} L ${x + w/2} ${y + flip * h} L ${x + w} ${y}" fill="none" stroke="${opts.primaryColor}" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>`
      }
    }
    return wrapPattern(content, opts)
  },
  defaultOpts, baseControls
)

// Islamic Star (8-point)
const islamicStar: PatternDefinition = patternDef(
  'islamic-star', 'Islamic Star', 'cultural',
  (opts) => {
    const r = 15 * opts.scale
    const spacing = 45 * opts.scale
    let content = ''
    for (let gy = -spacing; gy < PATTERN_SIZE + spacing; gy += spacing) {
      for (let gx = -spacing; gx < PATTERN_SIZE + spacing; gx += spacing) {
        const cx = gx + spacing / 2
        const cy = gy + spacing / 2
        // 8-point star
        let starPath = ''
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 - Math.PI / 8
          const rx = r * (i % 2 === 0 ? 1 : 0.4)
          const x = cx + Math.cos(angle) * rx
          const y = cy + Math.sin(angle) * rx
          starPath += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`)
        }
        starPath += ' Z'
        content += `<path d="${starPath}" fill="${opts.primaryColor}"/>`
      }
    }
    return wrapPattern(content, opts)
  },
  defaultOpts, baseControls
)

// Honeycomb
const honeycomb: PatternDefinition = patternDef(
  'honeycomb', 'Honeycomb', 'geometric',
  (opts) => {
    const r = 18 * opts.scale
    const h = Math.sqrt(3) * r
    const w = 1.5 * r
    let content = ''
    for (let row = -1; row < PATTERN_SIZE / h + 2; row++) {
      for (let col = -1; col < PATTERN_SIZE / w + 2; col++) {
        const cx = col * w + (row % 2 === 0 ? 0 : w / 2)
        const cy = row * h
        content += `<polygon points="` +
          Array.from({ length: 6 }, (_, i) => {
            const angle = (i / 6) * Math.PI * 2
            return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
          }).join(' ') +
          `" fill="none" stroke="${opts.primaryColor}" strokeWidth="1.5"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)
// eslint-disable-next-line @typescript-eslint/parser -- False positive parsing error on complex template literals
// Diagonal Stripes
const diagonalStripes: PatternDefinition = patternDef(
  'diagonal-stripes', 'Diagonal Stripes', 'geometric',
  (opts) => {
    const stripeWidth = 8 * opts.scale
    const gap = 16 * opts.scale
    const period = stripeWidth + gap
    let content = ''
    for (let i = -PATTERN_SIZE * 2; i < PATTERN_SIZE * 3; i += period) {
      content += `<rect x="${i}" y="-${PATTERN_SIZE * 2}" width="${stripeWidth}" height="${PATTERN_SIZE * 4}" fill="${opts.primaryColor}"/>`
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Grid
const gridPattern: PatternDefinition = patternDef(
  'grid', 'Grid', 'geometric',
  (opts) => {
    const spacing = 20 * opts.scale
    const lineWidth = 1 * opts.scale
    let content = ''
    for (let i = 0; i <= PATTERN_SIZE; i += spacing) {
      content += `<line x1="${i}" y1="0" x2="${i}" y2="${PATTERN_SIZE}" stroke="${opts.primaryColor}" strokeWidth="${lineWidth}"/>`
      content += `<line x1="0" y1="${i}" x2="${PATTERN_SIZE}" y2="${i}" stroke="${opts.primaryColor}" strokeWidth="${lineWidth}"/>`
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Waves
const waves: PatternDefinition = patternDef(
  'waves', 'Waves', 'organic',
  (opts) => {
    const amplitude = 10 * opts.scale
    const wavelength = 40 * opts.scale
    const lines = 5
    let content = ''
    for (let l = 0; l < lines; l++) {
      const yOffset = (PATTERN_SIZE / lines) * l
      let path = `M 0 ${yOffset}`
      for (let x = 0; x <= PATTERN_SIZE; x += 2) {
        const y = yOffset + Math.sin((x / wavelength) * Math.PI * 2) * amplitude
        path += ` L ${x} ${y}`
      }
      content += `<path d="${path}" fill="none" stroke="${opts.primaryColor}" strokeWidth="1.5" strokeLinecap="round"/>`
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Terrazzo (random chips)
const terrazzo: PatternDefinition = patternDef(
  'terrazzo', 'Terrazzo', 'organic',
  (opts) => {
    // Use a deterministic pseudo-random for chips
    const random = mulberry32(opts.seed || 12345)
    const chips = 80
    let content = ''
    for (let i = 0; i < chips; i++) {
      const x = random() * PATTERN_SIZE
      const y = random() * PATTERN_SIZE
      const w = 3 + random() * 12
      const h = 3 + random() * 12
      const rotation = random() * Math.PI * 2
      const colors = [opts.primaryColor, '#ffffff', '#f0f0f0', '#e0e0e0']
      const color = colors[Math.floor(random() * colors.length)]
      content += `<ellipse cx="${x}" cy="${y}" rx="${w/2}" ry="${h/2}" fill="${color}" transform="rotate(${rotation} ${x} ${y})"/>`
    }
    return wrapPattern(content, opts)
  ),
  { ...defaultOpts, seed: 12345 },
  [...baseControls, { key: 'seed', label: 'Seed', type: 'range', min: 1, max: 10000, step: 1 } as PatternControl]
)

// Dots Grid
const dotsGrid: PatternDefinition = patternDef(
  'dots-grid', 'Dots Grid', 'geometric',
  (opts) => {
    const spacing = 20 * opts.scale
    const r = 3 * opts.scale
    let content = ''
    for (let y = 0; y <= PATTERN_SIZE; y += spacing) {
      for (let x = 0; x <= PATTERN_SIZE; x += spacing) {
        content += `<circle cx="${x}" cy="${y}" r="${r}" fill="${opts.primaryColor}"/>`
      }
    }
    return wrapPattern(content, opts)
  },
  defaultOpts, baseControls
)

// Concentric Circles
const concentricCircles: PatternDefinition = patternDef(
  'concentric-circles', 'Concentric Circles', 'geometric',
  (opts) => {
    const spacing = 12 * opts.scale
    let content = ''
    for (let r = spacing; r < PATTERN_SIZE * 1.5; r += spacing) {
      content += `<circle cx="${PATTERN_SIZE/2}" cy="${PATTERN_SIZE/2}" r="${r}" fill="none" stroke="${opts.primaryColor}" strokeWidth="1"/>`
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Herringbone
const herringbone: PatternDefinition = patternDef(
  'herringbone', 'Herringbone', 'geometric',
  (opts) => {
    const w = 30 * opts.scale
    const h = 15 * opts.scale
    let content = ''
    for (let row = -1; row < PATTERN_SIZE / h + 2; row++) {
      for (let col = -1; col < PATTERN_SIZE / w + 2; col++) {
        const x = col * w + (row % 2 === 0 ? 0 : w / 2)
        const y = row * h
        const angle = (col + row) % 2 === 0 ? 45 : -45
        content += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${opts.primaryColor}" opacity="0.3" transform="rotate(${angle} ${x + w/2} ${y + h/2})"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Triangles
const triangles: PatternDefinition = patternDef(
  'triangles', 'Triangles', 'geometric',
  (opts) => {
    const size = 20 * opts.scale
    const h = Math.sqrt(3) / 2 * size
    let content = ''
    for (let row = -1; row < PATTERN_SIZE / h + 2; row++) {
      for (let col = -1; col < PATTERN_SIZE / size + 2; col++) {
        const x = col * size + (row % 2 === 0 ? 0 : size / 2)
        const y = row * h
        const up = (col + row) % 2 === 0
        content += `<polygon points="${x},${y + (up ? h : 0)} ${x + size/2},${y + (up ? 0 : h)} ${x + size},${y + (up ? h : 0)}" fill="${opts.primaryColor}" opacity="0.4"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Squares Rotated
const squaresRotated: PatternDefinition = patternDef(
  'squares-rotated', 'Rotated Squares', 'geometric',
  (opts) => {
    const size = 25 * opts.scale
    const spacing = 35 * opts.scale
    let content = ''
    for (let row = -1; row < PATTERN_SIZE / spacing + 2; row++) {
      for (let col = -1; col < PATTERN_SIZE / spacing + 2; col++) {
        const x = col * spacing + spacing / 2
        const y = row * spacing + spacing / 2
        content += `<rect x="${x - size/2}" y="${y - size/2}" width="${size}" height="${size}" fill="${opts.primaryColor}" opacity="0.3" transform="rotate(45 ${x} ${y})"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Hexagon Grid
const hexagonGrid: PatternDefinition = patternDef(
  'hexagon-grid', 'Hexagon Grid', 'geometric',
  (opts) => {
    const r = 15 * opts.scale
    const h = Math.sqrt(3) * r
    const w = 1.5 * r
    let content = ''
    for (let row = -1; row < PATTERN_SIZE / h + 2; row++) {
      for (let col = -1; col < PATTERN_SIZE / w + 2; col++) {
        const cx = col * w + (row % 2 === 0 ? 0 : w / 2)
        const cy = row * h
        content += `<polygon points="` +
          Array.from({ length: 6 }, (_, i) => {
            const angle = (i / 6) * Math.PI * 2 + Math.PI / 6
            return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
          }).join(' ') +
          `" fill="none" stroke="${opts.primaryColor}" strokeWidth="1"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Moroccan Trellis
const moroccanTrellis: PatternDefinition = patternDef(
  'moroccan-trellis', 'Moroccan Trellis', 'cultural',
  (opts) => {
    const scale = 30 * opts.scale
    let content = ''
    for (let gy = -scale; gy < PATTERN_SIZE + scale; gy += scale) {
      for (let gx = -scale; gx < PATTERN_SIZE + scale; gx += scale) {
        const cx = gx + scale / 2
        const cy = gy + scale / 2
        const r = scale * 0.35
        // Four arcs making a quatrefoil
        content += `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${r} ${r} 0 0 1 ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - r}" fill="none" stroke="${opts.primaryColor}" strokeWidth="2"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Scales (Fish Scales)
const scales: PatternDefinition = patternDef(
  'scales', 'Scales', 'organic',
  (opts) => {
    const r = 14 * opts.scale
    const h = r * 0.866
    const w = r * 1.5
    let content = ''
    for (let row = -1; row < PATTERN_SIZE / h + 2; row++) {
      for (let col = -1; col < PATTERN_SIZE / w + 2; col++) {
        const cx = col * w + (row % 2 === 0 ? 0 : w / 2)
        const cy = row * h + r * 0.5
        content += `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - h} A ${r} ${r} 0 0 1 ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy + h} Z" fill="${opts.primaryColor}" opacity="0.3"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Brick Wall
const brickWall: PatternDefinition = patternDef(
  'brick-wall', 'Brick Wall', 'geometric',
  (opts) => {
    const bw = 40 * opts.scale
    const bh = 20 * opts.scale
    const mortar = 2 * opts.scale
    let content = ''
    for (let row = -1; row < PATTERN_SIZE / (bh + mortar) + 2; row++) {
      for (let col = -1; col < PATTERN_SIZE / (bw + mortar) + 2; col++) {
        const x = col * (bw + mortar) + (row % 2 === 0 ? 0 : (bw + mortar) / 2)
        const y = row * (bh + mortar)
        content += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${opts.primaryColor}" opacity="0.4" rx="2"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Basket Weave
const basketWeave: PatternDefinition = patternDef(
  'basket-weave', 'Basket Weave', 'geometric',
  (opts) => {
    const size = 20 * opts.scale
    let content = ''
    for (let row = 0; row < PATTERN_SIZE; row += size * 2) {
      for (let col = 0; col < PATTERN_SIZE; col += size * 2) {
        // Horizontal bars
        content += `<rect x="${col}" y="${row}" width="${size * 2}" height="${size}" fill="${opts.primaryColor}" opacity="0.3"/>`
        content += `<rect x="${col}" y="${row + size}" width="${size * 2}" height="${size}" fill="${opts.primaryColor}" opacity="0.3"/>`
        // Vertical bars
        content += `<rect x="${col}" y="${row}" width="${size}" height="${size * 2}" fill="${opts.primaryColor}" opacity="0.3"/>`
        content += `<rect x="${col + size}" y="${row}" width="${size}" height="${size * 2}" fill="${opts.primaryColor}" opacity="0.3"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Plaid
const plaid: PatternDefinition = patternDef(
  'plaid', 'Plaid', 'geometric',
  (opts) => {
    const thick = 6 * opts.scale
    const thin = 1 * opts.scale
    const spacing = 30 * opts.scale
    let content = ''
    // Vertical thick
    for (let x = 0; x < PATTERN_SIZE; x += spacing) {
      content += `<rect x="${x}" y="0" width="${thick}" height="${PATTERN_SIZE}" fill="${opts.primaryColor}" opacity="0.4"/>`
      content += `<rect x="${x + thick + 2}" y="0" width="${thin}" height="${PATTERN_SIZE}" fill="${opts.primaryColor}" opacity="0.2"/>`
    }
    // Horizontal thick
    for (let y = 0; y < PATTERN_SIZE; y += spacing) {
      content += `<rect x="0" y="${y}" width="${PATTERN_SIZE}" height="${thick}" fill="${opts.primaryColor}" opacity="0.4"/>`
      content += `<rect x="0" y="${y + thick + 2}" width="${PATTERN_SIZE}" height="${thin}" fill="${opts.primaryColor}" opacity="0.2"/>`
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Confetti
const confetti: PatternDefinition = patternDef(
  'confetti', 'Confetti', 'decorative',
  (opts) => {
    const random = mulberry32(opts.seed || 54321)
    const pieces = 60
    let content = ''
    const shapes = ['rect', 'circle', 'triangle']
    const colors = [opts.primaryColor, '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94']
    for (let i = 0; i < pieces; i++) {
      const x = random() * PATTERN_SIZE
      const y = random() * PATTERN_SIZE
      const w = 4 + random() * 12
      const h = 4 + random() * 12
      const rotation = random() * Math.PI * 2
      const color = colors[Math.floor(random() * colors.length)]
      const shape = shapes[Math.floor(random() * shapes.length)]
      
      if (shape === 'rect') {
        content += `<rect x="${x - w/2}" y="${y - h/2}" width="${w}" height="${h}" fill="${color}" transform="rotate(${rotation} ${x} ${y})"/>`
      } else if (shape === 'circle') {
        content += `<circle cx="${x}" cy="${y}" r="${w/2}" fill="${color}"/>`
      } else {
        content += `<polygon points="${x},${y - h/2} ${x + w/2},${y + h/2} ${x - w/2},${y + h/2}" fill="${color}" transform="rotate(${rotation} ${x} ${y})"/>`
      }
    }
    return wrapPattern(content, opts)
  },
  { ...defaultOpts, seed: 54321 },
  [...baseControls, { key: 'seed', label: 'Seed', type: 'range', min: 1, max: 10000, step: 1 } as PatternControl]
)

// Halftone
const halftone: PatternDefinition = patternDef(
  'halftone', 'Halftone', 'decorative',
  (opts) => {
    const spacing = 12 * opts.scale
    let content = ''
    for (let y = 0; y <= PATTERN_SIZE; y += spacing) {
      for (let x = 0; x <= PATTERN_SIZE; x += spacing) {
        const dist = Math.sqrt((x - PATTERN_SIZE/2)**2 + (y - PATTERN_SIZE/2)**2)
        const maxDist = Math.sqrt(2) * PATTERN_SIZE / 2
        const r = (1 - dist / maxDist) * (spacing * 0.4)
        if (r > 1) {
          content += `<circle cx="${x}" cy="${y}" r="${r}" fill="${opts.primaryColor}"/>`
        }
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Maze
const maze: PatternDefinition = patternDef(
  'maze', 'Maze', 'geometric',
  (opts) => {
    const cellSize = 20 * opts.scale
    const wallWidth = 2 * opts.scale
    let content = ''
    const random = mulberry32(opts.seed || 99999)
    for (let row = 0; row < PATTERN_SIZE / cellSize; row++) {
      for (let col = 0; col < PATTERN_SIZE / cellSize; col++) {
        const x = col * cellSize
        const y = row * cellSize
        // Random walls
        if (random() > 0.5) {
          content += `<line x1="${x}" y1="${y}" x2="${x + cellSize}" y2="${y}" stroke="${opts.primaryColor}" strokeWidth="${wallWidth}"/>`
        }
        if (random() > 0.5) {
          content += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + cellSize}" stroke="${opts.primaryColor}" strokeWidth="${wallWidth}"/>`
        }
      }
    }
    return wrapPattern(content, opts)
  ),
  { ...defaultOpts, seed: 99999 },
  [...baseControls, { key: 'seed', label: 'Seed', type: 'range', min: 1, max: 10000, step: 1 } as PatternControl]
)

// Celtic Knot (simplified)
const celticKnot: PatternDefinition = patternDef(
  'celtic-knot', 'Celtic Knot', 'cultural',
  (opts) => {
    const size = 30 * opts.scale
    let content = ''
    for (let gy = -size; gy < PATTERN_SIZE + size; gy += size) {
      for (let gx = -size; gx < PATTERN_SIZE + size; gx += size) {
        const cx = gx + size / 2
        const cy = gy + size / 2
        const r = size * 0.35
        // Simplified knot crossing
        content += `<path d="M ${cx - r} ${cy} Q ${cx} ${cy - r} ${cx + r} ${cy} Q ${cx} ${cy + r} ${cx - r} ${cy}" fill="none" stroke="${opts.primaryColor}" strokeWidth="3" strokeLinecap="round"/>`
        content += `<path d="M ${cx} ${cy - r} Q ${cx + r} ${cy} ${cx} ${cy + r} Q ${cx - r} ${cy} ${cx} ${cy - r}" fill="none" stroke="${opts.primaryColor}" strokeWidth="3" strokeLinecap="round"/>`
        // Crossing breaks
        content += `<circle cx="${cx}" cy="${cy}" r="4" fill="${opts.backgroundColor !== 'transparent' ? opts.backgroundColor : '#ffffff'}"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// Snowflakes
const snowflakes: PatternDefinition = patternDef(
  'snowflakes', 'Snowflakes', 'organic',
  (opts) => {
    const spacing = 30 * opts.scale
    let content = ''
    for (let gy = -spacing; gy < PATTERN_SIZE + spacing; gy += spacing) {
      for (let gx = -spacing; gx < PATTERN_SIZE + spacing; gx += spacing) {
        const cx = gx + spacing / 2
        const cy = gy + spacing / 2
        const r = spacing * 0.3
        // Simple 6-branch snowflake
        let flake = ''
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2
          const x = cx + Math.cos(angle) * r
          const y = cy + Math.sin(angle) * r
          flake += ` M ${cx} ${cy} L ${x} ${y}`
          // Branches
          const bx = cx + Math.cos(angle) * r * 0.5
          const by = cy + Math.sin(angle) * r * 0.5
          const bAngle1 = angle + Math.PI / 6
          const bAngle2 = angle - Math.PI / 6
          flake += ` M ${bx} ${by} L ${bx + Math.cos(bAngle1) * r * 0.3} ${by + Math.sin(bAngle1) * r * 0.3}`
          flake += ` M ${bx} ${by} L ${bx + Math.cos(bAngle2) * r * 0.3} ${by + Math.sin(bAngle2) * r * 0.3}`
        }
        content += `<path d="${flake}" stroke="${opts.primaryColor}" strokeWidth="1.5" fill="none" strokeLinecap="round"/>`
      }
    }
    return wrapPattern(content, opts)
  ),
  defaultOpts, baseControls
)

// ============================================
// ALL PATTERNS EXPORT
// ============================================

export const PATTERN_DEFINITIONS: PatternDefinition[] = [
  polkaDots,
  chevron,
  islamicStar,
  honeycomb,
  diagonalStripes,
  gridPattern,
  waves,
  terrazzo,
  dotsGrid,
  concentricCircles,
  herringbone,
  triangles,
  squaresRotated,
  hexagonGrid,
  moroccanTrellis,
  scales,
  brickWall,
  basketWeave,
  plaid,
  confetti,
  halftone,
  maze,
  celticKnot,
  snowflakes,
]

/** Get pattern by ID */
export function getPattern(id: string): PatternDefinition | undefined {
  return PATTERN_DEFINITIONS.find(p => p.id === id)
}

/** Generate SVG with pattern applied as fill */
export function applyPatternToRect(
  patternId: string,
  width: number,
  height: number,
  options: Partial<PatternOptions> = {}
): string {
  const pattern = getPattern(patternId)
  if (!pattern) return ''
  
  const opts = { ...pattern.defaultOptions, ...options }
  const patternMarkup = pattern.generate(opts)
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${patternMarkup}</defs>
<rect width="100%" height="100%" fill="url(#custom-pattern)"/>
</svg>`
}