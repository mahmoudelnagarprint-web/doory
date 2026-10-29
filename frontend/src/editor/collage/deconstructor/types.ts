/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
/**
 * Smart Design Deconstructor — shared types.
 *
 * A deconstructed flat template image is split into:
 *  - a healed background layer (paper texture with holes filled)
 *  - rotated photo slots (OBBs) that photos drop into
 *  - detached movable ornaments (flowers, bows, pins, cards) as independent layers
 *  - editable text layers spawned from raster text on quote cards
 *  - foreground occlusion overlays (pushpins, washi tape, overlapping petals) that sit
 *    on top of the inserted photos so the scene reads like the original template.
 *
 * Everything here is lazy-loaded: the whole module is imported only when the user opens
 * the "تفكيك قالب ذكي" panel, so the initial editor bundle is untouched.
 */
import type { CollageFrameSpec, MaskShape } from '@/types/document'

/** Raster image data. */
export interface Raster {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** A detected rotated photo frame (oriented bounding box), in page px. */
export interface RotatedFrame {
  id: string
  cx: number
  cy: number
  width: number
  height: number
  /** Rotation in degrees, counter-clockwise. */
  angle: number
  /** Corner quadrilateral in page coordinates (clockwise from top-left). */
  corners: [number, number][]
  /** Crop shape inferred from the frame's interior paper (rounded, arch, circle, …). */
  mask?: MaskShape
  /** Corner radius as a fraction of the shorter side (0..0.5), for rounded masks. */
  radius?: number
  /** Foreground occlusion overlay (transparent PNG data URL) sitting above the photo. */
  foregroundOverlayDataUrl?: string
  /** Interior paper colour sampled at the frame's centre, for healing. */
  paperColor: string
  /** Confidence 0..1 of the detection. */
  confidence: number
}

/** A detached decorative element lifted from the flat template. */
export interface DetachedElement {
  id: string
  name: string
  /** Transparent PNG data URL of the cut-out element. */
  dataUrl: string
  /** Pixel width/height of the element image. */
  width: number
  height: number
  /** Where the element was on the template page (for placing it back). */
  originalX: number
  originalY: number
  /** Original scale so it matches the template's apparent size. */
  originalScale: number
}

/** A text card detected on the template and converted to an editable layer. */
export interface DetectedTextCard {
  id: string
  /** Bounding box in page px. */
  x: number
  y: number
  width: number
  height: number
  /** Rotation in degrees. */
  angle: number
  /** Sampled ink colour (the darkest text colour found). */
  inkColor: string
  /** Sampled paper colour behind the text (for the live text layer's background). */
  paperColor: string
  /** Estimated font size in page px. */
  fontSize: number
  /** Detected or empty string; the user types the real text. */
  text: string
  /** Confidence 0..1. */
  confidence: number
}

/** Full deconstruction result, ready to commit to the editor canvas. */
export interface DeconstructionResult {
  /** Healed background image data URL (paper with holes filled). */
  healedBackgroundDataUrl: string
  /** Rotated photo slots with their occlusion overlays. */
  frames: RotatedFrame[]
  /** Movable ornament layers detached from the template. */
  elements: DetachedElement[]
  /** Editable text layers spawned from raster text cards. */
  textCards: DetectedTextCard[]
  /** Page dimensions in px. */
  pageWidth: number
  pageHeight: number
}

/** Options for the deconstructor pipeline. */
export interface DeconstructorOptions {
  /** Minimum frame area as a fraction of the page (0..1). Default 0.02. */
  minFrameArea?: number
  /** Paper luminance threshold 0..255 for the adaptive segmentation. Default 200. */
  paperLuminanceThreshold?: number
  /** Feather radius in px for occlusion overlay alpha edges. Default 2. */
  occlusionFeather?: number
  /** Whether to run the optional lazy SAM/RMBG model when available. Default true. */
  useAdvancedSegmentation?: boolean
  /** Whether to run text detection (tesseract.js) when available. Default true. */
  useTextDetection?: boolean
}

/** A point in page px. */
export interface Point2D { x: number; y: number }

/** A rectangle in page px. */
export interface Rect2D { x: number; y: number; width: number; height: number }

/** Result of a single inpaint pass. */
export interface InpaintResult {
  dataUrl: string
  width: number
  height: number
}

/** Re-export CollageFrameSpec for convenience. */
export type { CollageFrameSpec, MaskShape }