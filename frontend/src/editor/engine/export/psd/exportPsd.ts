/**
 * Native multi-layer Photoshop .psd export.
 *
 * Every layer is serialised with explicit absolute bounds (`top`/`left`/`bottom`/`right`) and real pixels rendered from
 * the page's objects on an off-screen `StaticCanvas` — never a guessed rectangle. Collage slots become a clipping group:
 * the frame silhouette is the base layer, and the picture sits above it with `clipping: true`.
 *
 * Lazy-loaded to keep the initial editor chunk under its budget.
 */
import { type FabricObject, StaticCanvas } from 'fabric'
import type { Layer, Psd } from 'ag-psd'
import type { EditorEngine } from '@/editor/engine/editor'
import { pageSize } from '@/editor/engine/docOps'
import { buildBackground, installBackground } from '@/editor/engine/objects/background'
import { deserializeObjects } from '@/editor/engine/serialization'
import type { DocObject, DocPage } from '@/types/document'
import type { ExportFile } from '../registry'
import { pageFilename, sanitizeFilename } from '../registry'
import { bundleFiles } from '../zip'

export interface PsdExportOptions {
  scale?: number
  dpi?: number
  pages: Array<{ page: DocPage; index: number }>
}

/** A rectangle in page pixels (unscaled). */
interface Box {
  left: number
  top: number
  width: number
  height: number
}

interface PsdBox {
  top: number
  left: number
  bottom: number
  right: number
}

function hexToRgb(hex: unknown): { r: number; g: number; b: number } {
  const value = typeof hex === 'string' && hex ? hex.replace('#', '') : '000000'
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const num = Number.parseInt(full, 16) || 0
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

/** Clamps a rectangle to the page so no layer canvas grows past the document. */
function clampBox(left: number, top: number, right: number, bottom: number, pageWidth: number, pageHeight: number): Box {
  const l = Math.max(0, Math.min(pageWidth - 1, Math.floor(left)))
  const t = Math.max(0, Math.min(pageHeight - 1, Math.floor(top)))
  const r = Math.max(l + 1, Math.min(pageWidth, Math.ceil(right)))
  const b = Math.max(t + 1, Math.min(pageHeight, Math.ceil(bottom)))
  return { left: l, top: t, width: r - l, height: b - t }
}

function boundsOf(obj: FabricObject, pageWidth: number, pageHeight: number): Box {
  const r = obj.getBoundingRect()
  return clampBox(r.left, r.top, r.left + r.width, r.top + r.height, pageWidth, pageHeight)
}

/** The visible silhouette of an object: absolute clip paths live in page space, local ones inside the object. */
function frameBoundsOf(obj: FabricObject, fallback: Box, pageWidth: number, pageHeight: number): Box {
  const clip = obj.clipPath
  if (!clip || !clip.absolutePositioned) return fallback
  const r = clip.getBoundingRect()
  return clampBox(r.left, r.top, r.left + r.width, r.top + r.height, pageWidth, pageHeight)
}

/**
 * Renders one object, cropped to `box`, at `scale` pixels per page pixel. The returned canvas is exactly
 * `round(box.width * scale)` x `round(box.height * scale)` so its size always equals the layer's bounds.
 */
function renderObject(scene: StaticCanvas, obj: FabricObject, box: Box, scale: number): HTMLCanvasElement {
  // Pixels are rendered fully opaque and visible: the layer's own `opacity`/`hidden` are applied once by Photoshop.
  const opacity = obj.opacity
  const visible = obj.visible
  obj.opacity = 1
  obj.visible = true
  const raw = scene.toCanvasElement(scale, {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    filter: (candidate) => candidate === obj,
  })
  obj.opacity = opacity
  obj.visible = visible
  const width = Math.max(1, Math.round(box.width * scale))
  const height = Math.max(1, Math.round(box.height * scale))
  if (raw.width === width && raw.height === height) return raw
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  out.getContext('2d')?.drawImage(raw, 0, 0, width, height)
  return out
}

/** Replaces every pixel's colour with `color`, keeping the rendered alpha (the frame silhouette). */
function tint(canvas: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'source-over'
  return canvas
}

function copyCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas')
  copy.width = canvas.width
  copy.height = canvas.height
  copy.getContext('2d')?.drawImage(canvas, 0, 0)
  return copy
}

function psdBox(box: Box, scale: number): PsdBox {
  const top = Math.round(box.top * scale)
  const left = Math.round(box.left * scale)
  return { top, left, bottom: top + Math.max(1, Math.round(box.height * scale)), right: left + Math.max(1, Math.round(box.width * scale)) }
}

function pixelLayer(name: string, box: PsdBox, canvas: HTMLCanvasElement, doc: DocObject): Layer {
  const layer: Layer = {
    name,
    top: box.top,
    left: box.left,
    bottom: box.bottom,
    right: box.right,
    opacity: typeof doc.opacity === 'number' ? doc.opacity : 1,
    hidden: doc.visible === false,
    blendMode: 'normal',
    canvas,
  }
  return layer
}

function textLayer(doc: DocObject, box: Box, canvas: HTMLCanvasElement, scale: number): Layer {
  const text = String(doc.text ?? '')
  const fontSize = Math.max(1, Math.round((typeof doc.fontSize === 'number' ? doc.fontSize : 24) * scale))
  const family = typeof doc.fontFamily === 'string' && doc.fontFamily ? doc.fontFamily : 'Arial'
  const fill = hexToRgb(doc.fill)
  const box2 = psdBox(box, scale)
  const align = doc.textAlign === 'center' ? 'center' : doc.textAlign === 'right' ? 'right' : 'left'
  const layer: Layer = {
    ...pixelLayer(doc.name || 'Text', box2, canvas, doc),
    text: {
      text: text.replace(/\r?\n/g, '\r'),
      transform: [1, 0, 0, 1, box2.left, box2.top],
      style: {
        font: { name: family },
        fontSize,
        fillColor: fill,
      },
      paragraphStyle: { justification: align },
    },
  }
  // The raster is only a fallback: Photoshop draws the live text from `text`.
  return layer
}

function isSlot(doc: DocObject, obj: FabricObject): boolean {
  return obj.clipPath !== undefined || (doc.collage !== undefined && doc.collage.role === undefined)
}

function backgroundCanvas(page: DocPage, width: number, height: number, scale: number, engine: EditorEngine): Promise<HTMLCanvasElement> {
  const canvas = new StaticCanvas(document.createElement('canvas'), {
    width,
    height,
    renderOnAddRemove: false,
    enableRetinaScaling: false,
    skipOffscreen: false,
  })
  return buildBackground(page.background, width, height, (src) => engine.loadContext.resolveSrc(src)).then((built) => {
    installBackground(canvas, built, width, height)
    canvas.renderAll()
    const out = canvas.toCanvasElement(scale)
    void canvas.dispose()
    return out
  })
}

export async function exportToPsd(engine: EditorEngine, { scale = 1, dpi = 300, pages }: PsdExportOptions): Promise<ExportFile[]> {
  if (!pages || pages.length === 0) throw new Error('Select at least one page for PSD export')

  const { writePsd } = await import('ag-psd')

  const files: ExportFile[] = []
  const title = engine.state.title || 'design'

  for (const { page, index } of pages) {
    const size = pageSize(engine.state.doc, page)
    const pageWidth = Math.max(1, Math.round(size.width))
    const pageHeight = Math.max(1, Math.round(size.height))
    const doc = page.objects ?? []

    const docs = doc.filter((o) => !(o.isPlaceholder === true && o.type !== 'image'))
    const parsed = await deserializeObjects(docs, engine.loadContext)
    const objects = docs.map((d, i) => ({ doc: d, obj: parsed[i] })).filter((entry): entry is { doc: DocObject; obj: FabricObject } => !!entry.obj)

    // One source canvas for all objects: each layer is a filtered, cropped, scaled copy of it.
    const scene = new StaticCanvas(document.createElement('canvas'), {
      width: pageWidth,
      height: pageHeight,
      renderOnAddRemove: false,
      enableRetinaScaling: false,
      skipOffscreen: false,
    })
    scene.add(...objects.map((entry) => entry.obj))

    const children: Layer[] = []
    const paint: Array<{ canvas: HTMLCanvasElement; x: number; y: number }> = []

    for (const { doc: d, obj } of objects) {
      const fallbackBox = boundsOf(obj, pageWidth, pageHeight)
      const opacity = typeof d.opacity === 'number' ? d.opacity : 1
      const hidden = d.visible === false

      if (d.type === 'textbox' || d.type === 'text' || d.type === 'i-text') {
        const canvas = renderObject(scene, obj, fallbackBox, scale)
        const layer = textLayer(d, fallbackBox, canvas, scale)
        layer.opacity = opacity
        layer.hidden = hidden
        children.push(layer)
        if (!hidden) paint.push({ canvas, x: layer.left ?? 0, y: layer.top ?? 0 })
        continue
      }

      if (isSlot(d, obj)) {
        const frame = frameBoundsOf(obj, fallbackBox, pageWidth, pageHeight)
        const photoBox = fallbackBox
        const clip = obj.clipPath

        // The actual picture: rendered without its frame mask so Photoshop can clip it to the base layer.
        obj.clipPath = undefined
        obj.dirty = true
        const photo = renderObject(scene, obj, photoBox, scale)
        obj.clipPath = clip
        obj.dirty = true

        // The frame silhouette: the masked render, flattened to a solid colour that defines the clipping alpha.
        const masked = renderObject(scene, obj, frame, scale)
        const mask = tint(copyCanvas(masked), '#ffffff')

        const photoBounds = psdBox(photoBox, scale)
        const frameBox = psdBox(frame, scale)
        const clipped: Layer = {
          name: 'Photo',
          ...photoBounds,
          opacity,
          hidden,
          blendMode: 'normal',
          clipping: true,
          canvas: photo,
        }
        const base: Layer = {
          name: 'Frame Mask',
          ...frameBox,
          opacity: 1,
          hidden,
          blendMode: 'normal',
          canvas: mask,
        }
        // ag-psd writes children top-first: the clipped picture must sit immediately above its base.
        const group: Layer = {
          name: `Frame - ${d.name || 'Slot'}`,
          top: Math.min(photoBounds.top, frameBox.top),
          left: Math.min(photoBounds.left, frameBox.left),
          bottom: Math.max(photoBounds.bottom, frameBox.bottom),
          right: Math.max(photoBounds.right, frameBox.right),
          opened: false,
          blendMode: 'pass through',
          children: [clipped, base],
        }
        children.push(group)
        if (!hidden) {
          paint.push({ canvas: masked, x: frameBox.left, y: frameBox.top })
        }
        continue
      }

      const canvas = renderObject(scene, obj, fallbackBox, scale)
      const box = psdBox(fallbackBox, scale)
      const layer = pixelLayer(d.name || d.type || 'Object', box, canvas, d)
      layer.opacity = opacity
      layer.hidden = hidden
      children.push(layer)
      if (!hidden) paint.push({ canvas, x: box.left, y: box.top })
    }

    const width = Math.max(1, Math.round(size.width * scale))
    const height = Math.max(1, Math.round(size.height * scale))
    const background = await backgroundCanvas(page, pageWidth, pageHeight, scale, engine)

    // The composite is drawn from the same pixels as the layers, bottom-first.
    const composite = document.createElement('canvas')
    composite.width = width
    composite.height = height
    const cctx = composite.getContext('2d')
    if (cctx) {
      cctx.drawImage(background, 0, 0, width, height)
      for (const op of paint) cctx.drawImage(op.canvas, op.x, op.y)
    }

    // PSD layers are stored top-first.
    children.reverse()
    children.push({
      name: 'Background',
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      opacity: 1,
      hidden: false,
      blendMode: 'normal',
      canvas: background,
    })

    const psd: Psd = {
      width,
      height,
      channels: 4,
      bitsPerChannel: 8,
      colorMode: 3,
      canvas: composite,
      children,
      imageResources: {
        resolutionInfo: {
          horizontalResolution: dpi,
          horizontalResolutionUnit: 'PPI',
          widthUnit: 'Inches',
          verticalResolution: dpi,
          verticalResolutionUnit: 'PPI',
          heightUnit: 'Inches',
        },
      },
    }

    const buffer = await writePsd(psd)
    const blob = new Blob([buffer as BlobPart], { type: 'image/vnd.adobe.photoshop' })
    const filename = pages.length > 1
      ? pageFilename(title, 'psd', index + 1, pages.length, engine.state.doc.pages.length)
      : `${sanitizeFilename(title) || 'design'}.psd`

    files.push({ blob, filename })
    void scene.dispose()
  }

  if (files.length > 1) {
    return bundleFiles(files, title, { style: 'simple', unix: null })
  }
  return files
}
