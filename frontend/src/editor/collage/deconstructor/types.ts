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

/* ══════════════════════════════════════════════════════════════════════════════
 * Design Decomposer — real multi-stage pipeline contracts.
 *
 * Everything below is the frozen ABI shared by the pipeline stages, the providers
 * (real ONNX / classical), the editor bridge and the studio UI. Core algorithms are
 * DOM-free (plain typed arrays) so they can be unit-tested without a canvas: the
 * canvas/data-URL adapters live in `raster.ts` and `maskOps.ts`.
 * ══════════════════════════════════════════════════════════════════════════════ */

/** Coverage mask, one byte per pixel, 0 = outside the element, 255 = fully inside. */
export type PixelMask = Uint8Array

/**
 * How a layer's pixels were actually isolated. This is reported per layer and in the
 * result summary, so the UI can never present a classical cut-out as a neural result.
 */
export type ExtractionMethod =
  /** Real ONNX segmentation model inference (U2-Net family, see engine/bgRemoval). */
  | 'model-segmentation'
  /** Classical colour/region analysis, no neural network involved. */
  | 'classical-segmentation'
  /** Taken from the original pixels through a user-drawn selection. */
  | 'manual-selection'

/** Semantic class of an extracted layer, with `unknown` when the evidence is insufficient. */
export type LayerClass =
  | 'background'
  | 'photo'
  | 'person'
  | 'frame'
  | 'sticker'
  | 'decoration'
  | 'text'
  | 'logo'
  | 'shape'
  | 'shadow'
  | 'other'
  | 'unknown'

/** A rectangle in source-image pixels. */
export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/** OCR text recognised inside a layer. Only produced by a real OCR engine. */
export interface TextLayerData {
  /** Recognised characters. Empty string when `recognised` is false. */
  content: string
  /** A real installed font is never recoverable from a raster: this is a documented substitute. */
  fontFamily: string
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  direction: 'ltr' | 'rtl'
  /** False when no OCR engine was available: the layer must then stay a raster image. */
  recognised: boolean
  /** Engine that produced the text (e.g. `paddleocr`), or `null`. */
  engine: string | null
}

/** One element recovered from the flat design, as a real, independently editable layer. */
export interface ExtractedLayer {
  id: string
  /** Human readable, editable in the review list. */
  name: string
  layerClass: LayerClass
  /** RGBA PNG data URL cropped to `bounds`, everywhere else transparent. */
  croppedDataUrl: string
  /** RGBA PNG data URL at full source size: element opaque, rest transparent. Keeps alignment. */
  fullCanvasDataUrl: string
  /** 8-bit alpha mask data URL (grayscale) at `bounds` size. */
  alphaMaskDataUrl: string
  /** Placement in source-image pixels. */
  bounds: PixelRect
  /** Placement in page pixels, already scaled to the editor page. */
  page: { x: number; y: number; width: number; height: number }
  rotation: number
  opacity: number
  /** Back-to-front order; 0 is furthest back. */
  zIndex: number
  /** 0..1 evidence strength for this layer. */
  confidence: number
  extractionMethod: ExtractionMethod
  /** Present when the layer is (or contains) text. */
  text?: TextLayerData
  /** Track back to the source image so the user can re-run the extraction. */
  source: { url: string; width: number; height: number }
  /** Properties the editor can change on the committed object. */
  editableProperties: {
    movable: boolean
    resizable: boolean
    removable: boolean
    textEditable: boolean
  }
}

/** A non-fatal problem the pipeline hit, surfaced to the user verbatim. */
export interface PipelineWarning {
  code:
    | 'model-unavailable'
    | 'classical-fallback'
    | 'ocr-unavailable'
    | 'inpaint-classical'
    | 'no-elements'
    | 'truncated-layers'
    | 'low-confidence'
    | 'decode-limited'
  message: string
}

/** Real segmentation output for one image. */
export interface SegmentationOutput {
  /** Foreground coverage at the analysed resolution, `width * height` bytes. */
  foreground: PixelMask
  width: number
  height: number
  /** True only when a neural model actually ran. */
  neural: boolean
  /** Model id that ran, e.g. `u2netp`. */
  modelId: string | null
}

export interface SegmentationRequest {
  /** Source pixels, RGBA, straight alpha. */
  raster: Raster
  signal?: AbortSignal
  /** 0..100 within the segmentation stage. */
  onProgress?: (percent: number) => void
}

/** A real segmentation engine. `segment` must throw when it cannot run — never return a blank mask. */
export interface SegmentationProvider {
  readonly id: string
  readonly neural: boolean
  /** Whether this provider can run right now (model installed / runtime usable). */
  isAvailable(): Promise<boolean>
  segment(request: SegmentationRequest): Promise<SegmentationOutput>
}

/** A real OCR engine. */
export interface OcrProvider {
  readonly id: string
  isAvailable(): Promise<boolean>
  /** Recognise text in a RGBA PNG data URL. Throws when the engine cannot run. */
  recognise(imageDataUrl: string, signal?: AbortSignal): Promise<{ text: TextLayerData['content']; engine: string }>
}

export interface InpaintOptions {
  /** Patch radius for the exemplar fill. Default 4. */
  patchRadius?: number
  /** Search radius around the hole. Default 32. */
  searchRadius?: number
}

/** Real background reconstruction. `inpaint` must not return its input unchanged. */
export interface InpaintProvider {
  readonly id: string
  readonly neural: boolean
  isAvailable(): Promise<boolean>
  /** Returns a new raster with every pixel covered by `mask` rebuilt from real surroundings. */
  inpaint(raster: Raster, mask: PixelMask, options?: InpaintOptions): Promise<Raster>
}

/** Pipeline stages, in execution order. */
export type PipelineStage =
  | 'validate'
  | 'analyze'
  | 'segment'
  | 'classify'
  | 'extract'
  | 'reconstruct-background'
  | 'compose'
  | 'ready'

/** Overall pipeline status, including every honest failure state. */
export type PipelineStatus =
  | 'idle'
  | 'running'
  | 'ready'
  | 'cancelled'
  | 'failed'
  | 'model-unavailable'

/** Progress report emitted while the pipeline runs. Percentages are measured, never invented. */
export interface PipelineProgress {
  stage: PipelineStage
  /** Overall progress 0..100 across the whole run. */
  percent: number
  /** Human readable, Arabic, describes what is happening now. */
  message: string
}

/** Input accepted by the pipeline: a data/blob/http URL plus its decoded size. */
export interface PipelineInput {
  imageUrl: string
  width: number
  height: number
  /** Page size the layers must be scaled to when committed to the editor. */
  pageWidth: number
  pageHeight: number
}

export interface PipelineOptions {
  /** Smallest element to keep, as a fraction of the image. Default 0.0004. */
  minAreaFraction?: number
  /** Hard cap on extracted layers. Default 60. */
  maxLayers?: number
  /** Run real background reconstruction. Default true. */
  reconstructBackground?: boolean
  /** Try real OCR on text-candidate layers. Default true. */
  detectText?: boolean
  /** Injected providers (tests use deterministic ones). */
  providers?: {
    segmentation?: SegmentationProvider
    inpaint?: InpaintProvider
    ocr?: OcrProvider
  }
  signal?: AbortSignal
  onProgress?: (progress: PipelineProgress) => void
}

/** A successful decomposition. */
export interface PipelineResult {
  status: 'ready'
  input: PipelineInput
  /** The untouched original, kept so the user can always go back. */
  originalDataUrl: string
  layers: ExtractedLayer[]
  background: {
    /** The source image as-is. */
    originalDataUrl: string
    /** Rebuilt background with the front elements removed, or null when not attempted. */
    reconstructedDataUrl: string | null
    /** Which engine rebuilt it, or null. */
    method: string | null
  }
  /** Composite of the extracted layers, drawn back over the background for before/after review. */
  compositeDataUrl: string
  warnings: PipelineWarning[]
  /** Real provider id that produced the masks. */
  segmentationProviderId: string
  /** Whether the masks came from neural inference. */
  neural: boolean
  durationMs: number
}

/** An honest failure: the stage that failed and why. No empty result is ever dressed as success. */
export interface PipelineFailure {
  status: 'failed' | 'cancelled' | 'model-unavailable'
  stage: PipelineStage
  message: string
  warnings: PipelineWarning[]
}

export type PipelineOutcome = PipelineResult | PipelineFailure

/** Per-layer export bundle options. */
export interface LayerExportOptions {
  /** `cropped`: smallest box per layer. `full-canvas`: original canvas size, alignment preserved. */
  mode: 'cropped' | 'full-canvas'
  includeBackground: boolean
  includeManifest: boolean
}

/** The machine-readable manifest written next to exported layer images. */
export interface LayerManifest {
  version: 1
  source: { width: number; height: number; imageUrl: string }
  page: { width: number; height: number }
  segmentation: { providerId: string; neural: boolean }
  layers: {
    id: string
    name: string
    layerClass: LayerClass
    file: string
    bounds: PixelRect
    zIndex: number
    rotation: number
    opacity: number
    confidence: number
    extractionMethod: ExtractionMethod
    text: TextLayerData | null
  }[]
  background: { file: string | null; reconstructedFile: string | null; method: string | null }
}