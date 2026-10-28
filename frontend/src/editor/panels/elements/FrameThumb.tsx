import type { MaskShapeId } from '@/types/document'
import { EXTENDED_FRAMES, getBlobFrame, BLOB_SEEDS } from './FramesAndShapesCatalog'

export interface FrameDefinition {
  id: MaskShapeId
  name: string
  path: string
}

const BLOB_FRAMES = BLOB_SEEDS.map((_, i) => getBlobFrame(i))

export const NATIVE_FRAMES: FrameDefinition[] = [
  ...EXTENDED_FRAMES.filter(f => !f.generator).map(f => ({ id: f.id, name: f.name, path: f.path })),
  ...BLOB_FRAMES.map(f => ({ id: f.id, name: f.name, path: f.path })),
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
