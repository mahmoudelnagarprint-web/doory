/**
 * Frames, Shapes & Patterns Catalog
 * 25+ native clipping frames, procedural organic blob generator,
 * and 25+ customizable SVG pattern generators.
 */
import type { MaskShape } from '@/types/document'

// ============================================
// FRAME DEFINITIONS (25+ frames)
// ============================================

/** Catalog ids beyond the engine's `MaskShapeId` (extended frames insert via their own SVG path). */
export type FrameShapeId = MaskShapeId | (string & {})

export interface FrameDefinition {
  id: string
  name: string
  path: string
  category: 'basic' | 'geometric' | 'organic' | 'decorative' | 'specialty'
  /** Procedural frames (organic blobs) build their path from a seed at render time. */
  generator?: 'blob'
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

export const BLOB_SEEDS = [12345, 23456, 34567, 45678, 56789]

// ============================================
// PROCEDURAL ORGANIC BLOB GENERATOR
// ============================================

export interface BlobOptions {
  seed: number
  points?: number
  irregularity?: number
  size?: number
  centerX?: number
  centerY?: number
}

function mulberry32(a: number): () => number {
  return function() {
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function generateBlobPath(options: BlobOptions): string {
  const { seed, points = 8, irregularity = 0.4, size = 40, centerX = 50, centerY = 50 } = options
  const random = mulberry32(seed)
  const angles: number[] = []
  const radii: number[] = []
  
  for (let i = 0; i < points; i++) {
    angles.push((i / points) * Math.PI * 2)
  }
  for (let i = angles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[angles[i], angles[j]] = [angles[j], angles[i]]
  }
  angles.sort((a, b) => a - b)
  
  for (let i = 0; i < points; i++) {
    const baseRadius = size
    const variation = (random() - 0.5) * 2 * irregularity * size
    radii.push(Math.max(size * 0.3, baseRadius + variation))
  }
  
  const pathPoints = angles.map((angle, i) => {
    const r = radii[i]
    return { x: centerX + Math.cos(angle) * r, y: centerY + Math.sin(angle) * r, angle, radius: r }
  })
  pathPoints.push({ ...pathPoints[0] })
  
  let path = `M ${pathPoints[0].x.toFixed(1)},${pathPoints[0].y.toFixed(1)}`
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const current = pathPoints[i]
    const next = pathPoints[i + 1]
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

export function getBlobFrame(index: number): FrameDefinition {
  const seed = BLOB_SEEDS[index % BLOB_SEEDS.length]
  return {
    id: `blob-${index + 1}`,
    name: `Organic Blob ${index + 1}`,
    path: generateBlobPath({ seed, points: 8, irregularity: 0.35 + (index * 0.05), size: 42 }),
    category: 'organic',
    generator: 'blob',
  }
}

export function generateRandomBlobFrame(): FrameDefinition {
  const seed = Date.now() + Math.random() * 100000
  return {
    id: `blob-random-${seed}`,
    name: 'Random Blob',
    path: generateBlobPath({ seed, points: Math.floor(6 + Math.random() * 4), irregularity: 0.3 + Math.random() * 0.3, size: 38 + Math.random() * 8 }),
    category: 'organic',
    generator: 'blob',
  }
}

/** The mask to give the editor for a catalog frame: native primitives keep their id, the rest use their path. */
export function frameMask(frame: Pick<FrameDefinition, 'id' | 'path'>): MaskShape {
  if (frame.id === 'circle' || frame.id === 'rounded') return frame.id
  return { path: frame.path }
}

// ============================================
// SVG PATTERN GENERATORS (25+ patterns) - SIMPLIFIED
// ============================================

export interface PatternDefinition {
  id: string
  name: string
  category: 'geometric' | 'organic' | 'decorative' | 'cultural'
  generate: (options: PatternOptions) => string
  defaultOptions: PatternOptions
  controls: PatternControl[]
}

export interface PatternOptions {
  primaryColor: string
  backgroundColor: string
  scale: number
  opacity: number
  rotation?: number
  seed?: number
}

export interface PatternControl {
  key: keyof PatternOptions | 'rotation'
  label: string
  type: 'color' | 'range' | 'select'
  min?: number
  max?: number
  step?: number
  options?: { value: string | number; label: string }[]
}

const PATTERN_SIZE = 100
const baseControls: PatternControl[] = [
  { key: 'primaryColor', label: 'Pattern Color', type: 'color' },
  { key: 'backgroundColor', label: 'Background', type: 'color' },
  { key: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 3, step: 0.1 },
  { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'rotation', label: 'Rotation', type: 'range', min: 0, max: 360, step: 1 },
]

const defaultOptions: PatternOptions = {
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

// ============================================
// PATTERN GENERATOR FUNCTIONS (extracted to avoid parser issues)
// ============================================

function genPolkaDots(opts: PatternOptions): string {
  const r = 8 * opts.scale
  const spacing = 30 * opts.scale
  let content = ''
  for (let y = -spacing; y < 100 + spacing; y += spacing) {
    for (let x = -spacing; x < 100 + spacing; x += spacing) {
      const offsetX = (y / spacing) % 2 === 0 ? 0 : spacing / 2
      content += `<circle cx="${x + offsetX}" cy="${y}" r="${r}" fill="${opts.primaryColor}"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genChevron(opts: PatternOptions): string {
  const h = 20 * opts.scale
  const w = 40 * opts.scale
  let content = ''
  for (let y = -h * 2; y < 100 + h * 2; y += h) {
    for (let x = -w * 2; x < 100 + w * 2; x += w) {
      const flip = ((x / w) + (y / h)) % 2 === 0 ? 1 : -1
      content += `<path d="M ${x} ${y} L ${x + w/2} ${y + flip * h} L ${x + w} ${y}" fill="none" stroke="${opts.primaryColor}" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genIslamicStar(opts: PatternOptions): string {
  const r = 15 * opts.scale
  const spacing = 45 * opts.scale
  let content = ''
  for (let gy = -spacing; gy < 100 + spacing; gy += spacing) {
    for (let gx = -spacing; gx < 100 + spacing; gx += spacing) {
      const cx = gx + spacing / 2
      const cy = gy + spacing / 2
      let starPath = ''
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 8
        const rx = r * (i % 2 === 0 ? 1 : 0.4)
        const x = cx + Math.cos(angle) * rx
        const y = cy + Math.sin(angle) * rx
        starPath += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`)
      }
      content += `<path d="${starPath} Z" fill="${opts.primaryColor}"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genHoneycomb(opts: PatternOptions): string {
  const r = 18 * opts.scale
  const h = Math.sqrt(3) * r
  const w = 1.5 * r
  let content = ''
  for (let row = -1; row < 100 / h + 2; row++) {
    for (let col = -1; col < 100 / w + 2; col++) {
      const cx = col * w + (row % 2 === 0 ? 0 : w / 2)
      const cy = row * h
      const points = Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        return x + ',' + y
      }).join(' ')
      content += `<polygon points="${points}" fill="none" stroke="${opts.primaryColor}" strokeWidth="1.5"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genDiagonalStripes(opts: PatternOptions): string {
  const stripeWidth = 8 * opts.scale
  const gap = 16 * opts.scale
  const period = stripeWidth + gap
  let content = ''
  for (let i = -100 * 2; i < 100 * 3; i += period) {
    content += `<rect x="${i}" y="-200" width="${stripeWidth}" height="400" fill="${opts.primaryColor}"/>`
  }
  return wrapPattern(content, opts)
}

function genGrid(opts: PatternOptions): string {
  const spacing = 20 * opts.scale
  const lineWidth = 1 * opts.scale
  let content = ''
  for (let i = 0; i <= 100; i += spacing) {
    content += `<line x1="${i}" y1="0" x2="${i}" y2="100" stroke="${opts.primaryColor}" strokeWidth="${lineWidth}"/>`
    content += `<line x1="0" y1="${i}" x2="100" y2="${i}" stroke="${opts.primaryColor}" strokeWidth="${lineWidth}"/>`
  }
  return wrapPattern(content, opts)
}

function genWaves(opts: PatternOptions): string {
  const amplitude = 10 * opts.scale
  const wavelength = 40 * opts.scale
  const lines = 5
  let content = ''
  for (let l = 0; l < lines; l++) {
    const yOffset = (100 / lines) * l
    let path = `M 0 ${yOffset}`
    for (let x = 0; x <= 100; x += 2) {
      const y = yOffset + Math.sin((x / wavelength) * Math.PI * 2) * amplitude
      path += ` L ${x} ${y}`
    }
    content += `<path d="${path}" fill="none" stroke="${opts.primaryColor}" strokeWidth="1.5" strokeLinecap="round"/>`
  }
  return wrapPattern(content, opts)
}

function genTerrazzo(opts: PatternOptions): string {
  const random = mulberry32(opts.seed || 12345)
  const chips = 80
  let content = ''
  for (let i = 0; i < chips; i++) {
    const x = random() * 100
    const y = random() * 100
    const w = 3 + random() * 12
    const h = 3 + random() * 12
    const rotation = random() * Math.PI * 2
    const colors = [opts.primaryColor, '#ffffff', '#f0f0f0', '#e0e0e0']
    const color = colors[Math.floor(random() * colors.length)]
    content += `<ellipse cx="${x}" cy="${y}" rx="${w/2}" ry="${h/2}" fill="${color}" transform="rotate(${rotation} ${x} ${y})"/>`
  }
  return wrapPattern(content, opts)
}

function genDotsGrid(opts: PatternOptions): string {
  const spacing = 20 * opts.scale
  const r = 3 * opts.scale
  let content = ''
  for (let y = 0; y <= 100; y += spacing) {
    for (let x = 0; x <= 100; x += spacing) {
      content += `<circle cx="${x}" cy="${y}" r="${r}" fill="${opts.primaryColor}"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genConcentricCircles(opts: PatternOptions): string {
  const spacing = 12 * opts.scale
  let content = ''
  for (let r = spacing; r < 100 * 1.5; r += spacing) {
    content += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${opts.primaryColor}" strokeWidth="1"/>`
  }
  return wrapPattern(content, opts)
}

function genHerringbone(opts: PatternOptions): string {
  const w = 30 * opts.scale
  const h = 15 * opts.scale
  let content = ''
  for (let row = -1; row < 100 / h + 2; row++) {
    for (let col = -1; col < 100 / w + 2; col++) {
      const x = col * w + (row % 2 === 0 ? 0 : w / 2)
      const y = row * h
      const angle = (col + row) % 2 === 0 ? 45 : -45
      content += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${opts.primaryColor}" opacity="0.3" transform="rotate(${angle} ${x + w/2} ${y + h/2})"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genTriangles(opts: PatternOptions): string {
  const size = 20 * opts.scale
  const h = Math.sqrt(3) / 2 * size
  let content = ''
  for (let row = -1; row < 100 / h + 2; row++) {
    for (let col = -1; col < 100 / size + 2; col++) {
      const x = col * size + (row % 2 === 0 ? 0 : size / 2)
      const y = row * h
      const up = (col + row) % 2 === 0
      content += `<polygon points="${x},${y + (up ? h : 0)} ${x + size/2},${y + (up ? 0 : h)} ${x + size},${y + (up ? h : 0)}" fill="${opts.primaryColor}" opacity="0.4"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genSquaresRotated(opts: PatternOptions): string {
  const size = 25 * opts.scale
  const spacing = 35 * opts.scale
  let content = ''
  for (let row = -1; row < 100 / spacing + 2; row++) {
    for (let col = -1; col < 100 / spacing + 2; col++) {
      const x = col * spacing + spacing / 2
      const y = row * spacing + spacing / 2
      content += `<rect x="${x - size/2}" y="${y - size/2}" width="${size}" height="${size}" fill="${opts.primaryColor}" opacity="0.3" transform="rotate(45 ${x} ${y})"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genHexagonGrid(opts: PatternOptions): string {
  const r = 15 * opts.scale
  const h = Math.sqrt(3) * r
  const w = 1.5 * r
  let content = ''
  for (let row = -1; row < 100 / h + 2; row++) {
    for (let col = -1; col < 100 / w + 2; col++) {
      const cx = col * w + (row % 2 === 0 ? 0 : w / 2)
      const cy = row * h
      const points = Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2 + Math.PI / 6
        return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
      }).join(' ')
      content += `<polygon points="${points}" fill="none" stroke="${opts.primaryColor}" strokeWidth="1"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genMoroccanTrellis(opts: PatternOptions): string {
  const scale = 30 * opts.scale
  let content = ''
  for (let gy = -scale; gy < 100 + scale; gy += scale) {
    for (let gx = -scale; gx < 100 + scale; gx += scale) {
      const cx = gx + scale / 2
      const cy = gy + scale / 2
      const r = scale * 0.35
      content += `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${r} ${r} 0 0 1 ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - r}" fill="none" stroke="${opts.primaryColor}" strokeWidth="2"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genScales(opts: PatternOptions): string {
  const r = 14 * opts.scale
  const h = r * 0.866
  const w = r * 1.5
  let content = ''
  for (let row = -1; row < 100 / h + 2; row++) {
    for (let col = -1; col < 100 / w + 2; col++) {
      const cx = col * w + (row % 2 === 0 ? 0 : w / 2)
      const cy = row * h + r * 0.5
      content += `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - h} A ${r} ${r} 0 0 1 ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy + h} Z" fill="${opts.primaryColor}" opacity="0.3"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genBrickWall(opts: PatternOptions): string {
  const bw = 40 * opts.scale
  const bh = 20 * opts.scale
  const mortar = 2 * opts.scale
  let content = ''
  for (let row = -1; row < 100 / (bh + mortar) + 2; row++) {
    for (let col = -1; col < 100 / (bw + mortar) + 2; col++) {
      const x = col * (bw + mortar) + (row % 2 === 0 ? 0 : (bw + mortar) / 2)
      const y = row * (bh + mortar)
      content += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${opts.primaryColor}" opacity="0.4" rx="2"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genBasketWeave(opts: PatternOptions): string {
  const size = 20 * opts.scale
  let content = ''
  for (let row = 0; row < 100; row += size * 2) {
    for (let col = 0; col < 100; col += size * 2) {
      content += `<rect x="${col}" y="${row}" width="${size * 2}" height="${size}" fill="${opts.primaryColor}" opacity="0.3"/>`
      content += `<rect x="${col}" y="${row + size}" width="${size * 2}" height="${size}" fill="${opts.primaryColor}" opacity="0.3"/>`
      content += `<rect x="${col}" y="${row}" width="${size}" height="${size * 2}" fill="${opts.primaryColor}" opacity="0.3"/>`
      content += `<rect x="${col + size}" y="${row}" width="${size}" height="${size * 2}" fill="${opts.primaryColor}" opacity="0.3"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genPlaid(opts: PatternOptions): string {
  const thick = 6 * opts.scale
  const thin = 1 * opts.scale
  const spacing = 30 * opts.scale
  let content = ''
  for (let x = 0; x < 100; x += spacing) {
    content += `<rect x="${x}" y="0" width="${thick}" height="100" fill="${opts.primaryColor}" opacity="0.4"/>`
    content += `<rect x="${x + thick + 2}" y="0" width="${thin}" height="100" fill="${opts.primaryColor}" opacity="0.2"/>`
  }
  for (let y = 0; y < 100; y += spacing) {
    content += `<rect x="0" y="${y}" width="100" height="${thick}" fill="${opts.primaryColor}" opacity="0.4"/>`
    content += `<rect x="0" y="${y + thick + 2}" width="100" height="${thin}" fill="${opts.primaryColor}" opacity="0.2"/>`
  }
  return wrapPattern(content, opts)
}

function genConfetti(opts: PatternOptions): string {
  const random = mulberry32(opts.seed || 54321)
  const pieces = 60
  let content = ''
  const shapes = ['rect', 'circle', 'triangle']
  const colors = [opts.primaryColor, '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94']
  for (let i = 0; i < pieces; i++) {
    const x = random() * 100
    const y = random() * 100
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
}

function genHalftone(opts: PatternOptions): string {
  const spacing = 12 * opts.scale
  let content = ''
  for (let y = 0; y <= 100; y += spacing) {
    for (let x = 0; x <= 100; x += spacing) {
      const dist = Math.sqrt((x - 50)**2 + (y - 50)**2)
      const maxDist = Math.sqrt(2) * 50
      const r = (1 - dist / maxDist) * (spacing * 0.4)
      if (r > 1) content += `<circle cx="${x}" cy="${y}" r="${r}" fill="${opts.primaryColor}"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genMaze(opts: PatternOptions): string {
  const cellSize = 20 * opts.scale
  const wallWidth = 2 * opts.scale
  let content = ''
  const random = mulberry32(opts.seed || 99999)
  for (let row = 0; row < 100 / cellSize; row++) {
    for (let col = 0; col < 100 / cellSize; col++) {
      const x = col * cellSize
      const y = row * cellSize
      if (random() > 0.5) content += `<line x1="${x}" y1="${y}" x2="${x + cellSize}" y2="${y}" stroke="${opts.primaryColor}" strokeWidth="${wallWidth}"/>`
      if (random() > 0.5) content += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + cellSize}" stroke="${opts.primaryColor}" strokeWidth="${wallWidth}"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genCelticKnot(opts: PatternOptions): string {
  const size = 30 * opts.scale
  let content = ''
  for (let gy = -size; gy < 100 + size; gy += size) {
    for (let gx = -size; gx < 100 + size; gx += size) {
      const cx = gx + size / 2
      const cy = gy + size / 2
      const r = size * 0.35
      content += `<path d="M ${cx - r} ${cy} Q ${cx} ${cy - r} ${cx + r} ${cy} Q ${cx} ${cy + r} ${cx - r} ${cy}" fill="none" stroke="${opts.primaryColor}" strokeWidth="3" strokeLinecap="round"/>`
      content += `<path d="M ${cx} ${cy - r} Q ${cx + r} ${cy} ${cx} ${cy + r} Q ${cx - r} ${cy} ${cx} ${cy - r}" fill="none" stroke="${opts.primaryColor}" strokeWidth="3" strokeLinecap="round"/>`
      content += `<circle cx="${cx}" cy="${cy}" r="4" fill="${opts.backgroundColor !== 'transparent' ? opts.backgroundColor : '#ffffff'}"/>`
    }
  }
  return wrapPattern(content, opts)
}

function genSnowflakes(opts: PatternOptions): string {
  const spacing = 30 * opts.scale
  let content = ''
  for (let gy = -spacing; gy < 100 + spacing; gy += spacing) {
    for (let gx = -spacing; gx < 100 + spacing; gx += spacing) {
      const cx = gx + spacing / 2
      const cy = gy + spacing / 2
      const r = spacing * 0.3
      let flake = ''
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        flake += ` M ${cx} ${cy} L ${x} ${y}`
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
}

// ============================================
// ALL PATTERNS EXPORT
// ============================================

export const PATTERN_DEFINITIONS: PatternDefinition[] = [
  { id: 'polka-dots', name: 'Polka Dots', category: 'geometric', generate: genPolkaDots, defaultOptions, controls: baseControls },
  { id: 'chevron', name: 'Chevron', category: 'geometric', generate: genChevron, defaultOptions, controls: baseControls },
  { id: 'islamic-star', name: 'Islamic Star', category: 'cultural', generate: genIslamicStar, defaultOptions, controls: baseControls },
  { id: 'honeycomb', name: 'Honeycomb', category: 'geometric', generate: genHoneycomb, defaultOptions, controls: baseControls },
  { id: 'diagonal-stripes', name: 'Diagonal Stripes', category: 'geometric', generate: genDiagonalStripes, defaultOptions, controls: baseControls },
  { id: 'grid', name: 'Grid', category: 'geometric', generate: genGrid, defaultOptions, controls: baseControls },
  { id: 'waves', name: 'Waves', category: 'organic', generate: genWaves, defaultOptions, controls: baseControls },
  { id: 'terrazzo', name: 'Terrazzo', category: 'organic', generate: genTerrazzo, defaultOptions, controls: baseControls },
  { id: 'dots-grid', name: 'Dots Grid', category: 'geometric', generate: genDotsGrid, defaultOptions, controls: baseControls },
  { id: 'concentric-circles', name: 'Concentric Circles', category: 'geometric', generate: genConcentricCircles, defaultOptions, controls: baseControls },
  { id: 'herringbone', name: 'Herringbone', category: 'geometric', generate: genHerringbone, defaultOptions, controls: baseControls },
  { id: 'triangles', name: 'Triangles', category: 'geometric', generate: genTriangles, defaultOptions, controls: baseControls },
  { id: 'squares-rotated', name: 'Rotated Squares', category: 'geometric', generate: genSquaresRotated, defaultOptions, controls: baseControls },
  { id: 'hexagon-grid', name: 'Hexagon Grid', category: 'geometric', generate: genHexagonGrid, defaultOptions, controls: baseControls },
  { id: 'moroccan-trellis', name: 'Moroccan Trellis', category: 'cultural', generate: genMoroccanTrellis, defaultOptions, controls: baseControls },
  { id: 'scales', name: 'Scales', category: 'organic', generate: genScales, defaultOptions, controls: baseControls },
  { id: 'brick-wall', name: 'Brick Wall', category: 'geometric', generate: genBrickWall, defaultOptions, controls: baseControls },
  { id: 'basket-weave', name: 'Basket Weave', category: 'geometric', generate: genBasketWeave, defaultOptions, controls: baseControls },
  { id: 'plaid', name: 'Plaid', category: 'geometric', generate: genPlaid, defaultOptions, controls: baseControls },
  { id: 'confetti', name: 'Confetti', category: 'decorative', generate: genConfetti, defaultOptions, controls: baseControls },
  { id: 'halftone', name: 'Halftone', category: 'decorative', generate: genHalftone, defaultOptions, controls: baseControls },
  { id: 'maze', name: 'Maze', category: 'geometric', generate: genMaze, defaultOptions, controls: baseControls },
  { id: 'celtic-knot', name: 'Celtic Knot', category: 'cultural', generate: genCelticKnot, defaultOptions, controls: baseControls },
  { id: 'snowflakes', name: 'Snowflakes', category: 'organic', generate: genSnowflakes, defaultOptions, controls: baseControls },
]

export function getPattern(id: string): PatternDefinition | undefined {
  return PATTERN_DEFINITIONS.find(p => p.id === id)
}

export function applyPatternToRect(patternId: string, _width: number, _height: number, options: Partial<PatternOptions> = {}): string {
  const pattern = getPattern(patternId)
  if (!pattern) return ''
  const opts = { ...pattern.defaultOptions, ...options }
  return pattern.generate(opts)
}
