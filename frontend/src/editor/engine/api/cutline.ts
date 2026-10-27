/**
 * Die-cut contours: trace the visible alpha edge of one image or SVG element, grow it by a bleed and
 * put a hairline CutContour path behind the object, grouped with it.
 *
 * The tracer and Paper.js are imported on first use: most designs never need them, and they are a
 * sizeable part of the editor bundle.
 */
// `imagetracerjs` ships without types; this brings ours in for every TypeScript project that reaches this file.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../../types/imagetracerjs.d.ts" />
import { Group, Path, StaticCanvas, type FabricObject } from 'fabric'
import type { EditorEngine } from '../editor'
import { mmToPx } from '../units'
import { asDory, ensureId } from '../objects/dory'
import { kindOfLive } from '../objects/kinds'
import { alphaToMask, blackPathsFromSvg, dilateMask, maskCount, maskToRgba } from '../cutline/mask'
import { traceToPagePath } from '../cutline/paper'
import { t } from '../../strings'

/** The spot-colour name printing tools look for. */
export const CUT_LINE_COLOR = '#FF0055'
/** Offset used when the UI has no remembered value. */
export const DEFAULT_CUT_LINE_OFFSET_MM = 2
const MAX_OFFSET_MM = 25
/** A trace wider than this is downscaled: a 1 px cut line does not need more detail. */
const MAX_TRACE_SIDE = 2048
const MAX_TRACE_SCALE = 2
/** At least this many raster pixels of empty space around the object, so the bleed is never clipped. */
const TRACE_MARGIN_PX = 4

const TRACE_OPTIONS = {
  // Exactly two colours: the grown object in black, everything else in white.
  pal: [
    { r: 0, g: 0, b: 0, a: 255 },
    { r: 255, g: 255, b: 255, a: 255 },
  ],
  colorsampling: 0,
  numberofcolors: 2,
  colorquantcycles: 1,
  ltres: 1,
  qtres: 1,
  pathomit: 2,
  rightangleenhance: false,
  layering: 0,
  strokewidth: 0,
  linefilter: false,
  scale: 1,
  roundcoords: 2,
  viewbox: false,
  desc: false,
  blurradius: 0,
}

export type CutLineErrorCode = 'empty' | 'render'

export class CutLineError extends Error {
  constructor(readonly code: CutLineErrorCode) {
    super(code === 'empty' ? 'The object has no visible edge to trace.' : 'The object could not be rendered.')
    this.name = 'CutLineError'
  }
}

/** Convert a mm offset to page pixels (2 mm ≈ 7.56 px at 96 dpi), clamped to the tool's range. */
export function cutLineOffsetPx(offsetMm: number): number {
  const mm = Number.isFinite(offsetMm)
    ? Math.min(MAX_OFFSET_MM, Math.max(0, offsetMm))
    : DEFAULT_CUT_LINE_OFFSET_MM
  return mmToPx(mm)
}

export class CutLineApi {
  constructor(private readonly engine: EditorEngine) {}

  /** True for the one unlocked image or SVG element that the tool can work on. */
  canGenerate(): boolean {
    const view = this.engine.activeView()
    if (!view || this.engine.readOnly) return false
    const active = view.canvas.getActiveObject()
    if (!active || active !== view.selectedObjects()[0] || view.selectedObjects().length !== 1) return false
    if (asDory(active).locked || active.visible === false) return false
    const kind = kindOfLive(active)
    return kind === 'image' || kind === 'element'
  }

  /**
   * Grows the selected object's alpha edge by `offsetMm` and groups the new cut line behind it.
   * Returns false when there is nothing valid to trace (a stale selection, read-only mode).
   */
  async generate(offsetMm = DEFAULT_CUT_LINE_OFFSET_MM): Promise<boolean> {
    if (!this.canGenerate()) return false
    const view = this.engine.activeView()
    const obj = view?.selectedObjects()[0]
    if (!view || !obj) return false
    const pageId = this.engine.state.activePageId
    const id = asDory(obj).id
    if (!id) return false

    const bbox = obj.getBoundingRect()
    if (!(bbox.width > 0) || !(bbox.height > 0)) throw new CutLineError('empty')

    const offsetPx = cutLineOffsetPx(offsetMm)
    const maxSide = Math.max(bbox.width, bbox.height)
    // The denominator includes the bleed so the longest side stays inside MAX_TRACE_SIDE.
    const scale = Math.min(MAX_TRACE_SCALE, MAX_TRACE_SIDE / (maxSide + 2 * (offsetPx + TRACE_MARGIN_PX)))
    const pad = offsetPx + TRACE_MARGIN_PX / scale
    const width = Math.max(1, Math.ceil((bbox.width + 2 * pad) * scale))
    const height = Math.max(1, Math.ceil((bbox.height + 2 * pad) * scale))

    const mask = await renderMask(obj, bbox, scale, pad, width, height)
    if (maskCount(mask) === 0) throw new CutLineError('empty')

    const grown = dilateMask(mask, width, height, offsetPx * scale)
    const { default: ImageTracer } = await import('imagetracerjs')
    const svg = ImageTracer.imagedataToSVG(maskToRgba(grown, width, height), TRACE_OPTIONS)
    const contours = blackPathsFromSvg(svg)
    if (contours.length === 0) throw new CutLineError('empty')

    const pagePath = await traceToPagePath(contours.join(' '), {
      scale,
      left: bbox.left - pad,
      top: bbox.top - pad,
    })

    // The user may have selected something else while the trace ran.
    if (this.engine.state.activePageId !== pageId || this.engine.readOnly) return false
    if (view.canvas.getActiveObject() !== obj || view.selectedObjects().length !== 1 || view.getById(id) !== obj) return false

    this.place(obj, pagePath)
    return true
  }

  private place(obj: FabricObject, pathData: string): void {
    const view = this.engine.activeView()
    if (!view) return
    const canvas = view.canvas
    const index = canvas.getObjects().indexOf(obj)
    if (index < 0) return

    const cut = new Path(pathData, {
      fill: null,
      stroke: CUT_LINE_COLOR,
      strokeWidth: 1,
      strokeUniform: true,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      objectCaching: false,
      selectable: false,
      evented: false,
    })
    ensureId(cut)
    asDory(cut).name = t.toolbar.cutLine

    canvas.discardActiveObject()
    canvas.remove(obj)
    // First child paints first: the contour sits behind the artwork it belongs to.
    const group = new Group([cut, obj], { subTargetCheck: false, interactive: false })
    ensureId(group)
    view.configure(group)
    canvas.insertAt(Math.min(index, canvas.getObjects().length), group)
    canvas.setActiveObject(group)
    canvas.requestRenderAll()
    this.engine.commitActive({ label: t.history.cutLine })
    this.engine.announce(t.announce.cutLine)
  }
}

/** Render one object alone, at page coordinates, into a padded offscreen canvas and read its alpha. */
async function renderMask(
  obj: FabricObject,
  bbox: { left: number; top: number; width: number; height: number },
  scale: number,
  pad: number,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  const canvas = new StaticCanvas(element, {
    width,
    height,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
    skipOffscreen: false,
  })
  let clone: FabricObject | null = null
  try {
    clone = await obj.clone()
    // A shadow is not part of the object: the cut follows the shape.
    clone.set({ shadow: null, selectable: false, evented: false })
    canvas.viewportTransform = [scale, 0, 0, scale, (pad - bbox.left) * scale, (pad - bbox.top) * scale]
    canvas.add(clone)
    canvas.renderAll()
    const data = element.getContext('2d')?.getImageData(0, 0, width, height)
    if (!data) throw new CutLineError('render')
    return alphaToMask(data.data, width, height)
  } catch (err) {
    if (err instanceof CutLineError) throw err
    throw new CutLineError('render')
  } finally {
    if (clone) canvas.remove(clone)
    canvas.dispose()
  }
}
