import type { MaskShapeId } from '@/types/document'

export interface FrameDefinition {
  id: MaskShapeId
  name: string
  path: string
}

export const NATIVE_FRAMES: FrameDefinition[] = [
  {
    id: 'circle',
    name: 'Circle Frame',
    path: 'M 50, 50 m -46, 0 a 46,46 0 1,0 92,0 a 46,46 0 1,0 -92,0',
  },
  {
    id: 'rounded',
    name: 'Rounded Frame',
    path: 'M 14,4 H 86 A 10,10 0 0 1 96,14 V 86 A 10,10 0 0 1 86,96 H 14 A 10,10 0 0 1 4,86 V 14 A 10,10 0 0 1 14,4 Z',
  },
  {
    id: 'blob',
    name: 'Blob Frame',
    path: 'M50 4 C74 2 96 20 96 46 C96 74 76 98 48 96 C22 94 4 76 4 50 C4 24 24 6 50 4 Z',
  },
  {
    id: 'heart',
    name: 'Heart Frame',
    path: 'M50 92 C16 68 4 50 4 32 C4 16 16 6 30 6 C38 6 46 11 50 19 C54 11 62 6 70 6 C84 6 96 16 96 32 C96 50 84 68 50 92 Z',
  },
  {
    id: 'star',
    name: 'Star Frame',
    path: 'M50 4 L64 33 L96 38 L73 60 L78 92 L50 77 L22 92 L27 60 L4 38 L36 33 Z',
  },
  {
    id: 'arch',
    name: 'Arch Frame',
    path: 'M 6,96 V 48 A 44,44 0 0 1 94,48 V 96 Z',
  },
  {
    id: 'hexagon',
    name: 'Hexagon Frame',
    path: 'M26 6 H74 L96 50 L74 94 H26 L4 50 Z',
  },
  {
    id: 'diamond',
    name: 'Diamond Frame',
    path: 'M50 4 L96 50 L50 96 L4 50 Z',
  },
  {
    id: 'triangle',
    name: 'Triangle Frame',
    path: 'M50 6 L94 94 H6 Z',
  },
  {
    id: 'cross',
    name: 'Cross Frame',
    path: 'M34 4 H66 V34 H96 V66 H66 V96 H34 V66 H4 V34 H34 Z',
  },
]

export function FrameArtwork({ path, id }: { path: string; id: string }) {
  const clipId = `frame-clip-${id}`
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <clipPath id={clipId}>
          <path d={path} fillRule="evenodd" />
        </clipPath>
        <linearGradient id={`sky-grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#70c4ec" />
          <stop offset="65%" stopColor="#b4e4f7" />
          <stop offset="100%" stopColor="#d8f3fd" />
        </linearGradient>
      </defs>

      {/* Frame content clipped to the shape: Canva-style landscape */}
      <g clipPath={`url(#${clipId})`}>
        {/* Sky */}
        <rect x="0" y="0" width="100" height="100" fill={`url(#sky-grad-${id})`} />

        {/* Cloud */}
        <ellipse cx="68" cy="38" rx="18" ry="10" fill="#ffffff" opacity="0.9" />
        <ellipse cx="80" cy="40" rx="12" ry="8" fill="#ffffff" opacity="0.9" />
        <ellipse cx="58" cy="42" rx="14" ry="7" fill="#ffffff" opacity="0.9" />

        {/* Back green hill */}
        <path d="M 15 100 Q 55 60 95 100 Z" fill="#68d391" opacity="0.9" />

        {/* Front rolling hill */}
        <path d="M -10 100 Q 35 68 75 100 Z" fill="#48bb78" />
        <path d="M 40 100 Q 80 78 110 100 Z" fill="#38a169" />
      </g>

      {/* Subtle border to outline the frame shape */}
      <path d={path} fill="none" stroke="rgba(0, 0, 0, 0.08)" strokeWidth="2" />
    </svg>
  )
}
