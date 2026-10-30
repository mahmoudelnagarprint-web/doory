/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
/**
 * Design Decomposer — legacy bright-frame detector for flat collage templates.
 *
 * Superseded by `./pipeline.ts` (real segmentation + region decomposition), which is what the Design
 * Decomposer studio runs; this module stays only for the legacy template path and its tests.
 *
 * What it genuinely does, with no overstating: it thresholds bright "paper" pixels, groups them into
 * connected components and fits a minimum-area rectangle to each — a classical CV detector for *photo
 * frames*, not a segmentation model, and not an element extractor. Inside each recovered rectangle it
 * classifies pixels that deviate from the frame's interior paper colour and feathers them into a
 * transparent PNG overlay, so pushpins / ribbons / tape intruding into a frame stay on top of the photo
 * dropped into it. Everything runs client-side on a hidden OffscreenCanvas. No server, no paid API.
 */
import type { DeconstructorOptions, Point2D, Rect2D, RotatedFrame } from './types'


function rgbToLuminance(r: number, g: number, b: number): number {
  // Rec. 709 relative luminance → approx CIE L* = 116 * f(Y)^(1/3) - 16
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return Y <= 0.008856 ? 903.3 * Y : 116 * Math.pow(Y, 1 / 3) - 16
}

function colourDistance(a: { r: number; g: number; b: number }, bCol: { r: number; g: number; b: number }): number {
  const da = a.r - bCol.r
  const dg = a.g - bCol.g
  const db = a.b - bCol.b
  return Math.sqrt(da * da + dg * dg + db * db)
}


interface Raster {
  width: number
  height: number
  data: Uint8ClampedArray // RGBA
}

function loadImageAsRaster(url: string): Promise<Raster> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = new OffscreenCanvas(img.width, img.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no 2d context'))
      ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, img.width, img.height)
      resolve({ width: img.width, height: img.height, data: id.data })
    }
    img.onerror = () => reject(new Error(`failed to load image: ${url}`))
    img.src = url
  })
}


interface Component {
  pixels: Point2D[]
  bounds: Rect2D
}

function connectedComponents(mask: Uint8Array, width: number, height: number): Component[] {
  const visited = new Uint8Array(width * height)
  const out: Component[] = []
  const dirs = [-1, 1, -width, width] // 4-connectivity

  for (let start = 0; start < width * height; start++) {
    if (mask[start] === 0 || visited[start] === 1) continue
    const stack = [start]
    visited[start] = 1
    const pixels: Point2D[] = []
    let minX = width, minY = height, maxX = -1, maxY = -1
    while (stack.length) {
      const idx = stack.pop()!
      const x = idx % width
      const y = (idx / width) | 0
      pixels.push({ x, y })
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      for (const d of dirs) {
        const ni = idx + d
        if (ni < 0 || ni >= width * height) continue
        // Same row wrap check for left/right moves.
        if ((d === -1 && x === 0) || (d === 1 && x === width - 1)) continue
        if (mask[ni] === 1 && visited[ni] === 0) {
          visited[ni] = 1
          stack.push(ni)
        }
      }
    }
    out.push({
      pixels,
      bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    })
  }
  return out
}


function paperMask(raster: Raster, luminanceThreshold: number): Uint8Array {
  const { width, height, data } = raster
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4
      const l = rgbToLuminance(data[i], data[i + 1], data[i + 2])
      if (l >= luminanceThreshold && data[i + 3] > 128) mask[row + x] = 1
    }
  }
  return mask
}


function minimumAreaRectangle(points: Point2D[]): RotatedFrame {
  // Candidate angles from dominant edges: sample every 1 degree 0..180.
  let best: { cx: number; cy: number; w: number; h: number; angle: number; area: number } | null = null
  for (let deg = 0; deg < 180; deg++) {
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of points) {
      const rx = p.x * cos + p.y * sin
      const ry = -p.x * sin + p.y * cos
      if (rx < minX) minX = rx
      if (ry < minY) minY = ry
      if (rx > maxX) maxX = rx
      if (ry > maxY) maxY = ry
    }
    const area = (maxX - minX) * (maxY - minY)
    if (!best || area < best.area) {
      best = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY, angle: deg, area }
    }
  }
  const b = best!
  // Rotate centre back into page space.
  const rad = (b.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // Page space centre = rotate OBB centre by -angle? We solved in rotated frame where
  // page x-axis is aligned with angle. So page centre = rotate(-angle) of local centre.
  const localCx = b.cx
  const localCy = b.cy
  const pageCx = localCx * cos - localCy * sin
  const pageCy = localCx * sin + localCy * cos
  // Corners in page space: local corners rotated back.
  const hw = b.w / 2
  const hh = b.h / 2
  const localCorners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ]
  const corners: [number, number][] = localCorners.map((c) => {
    const lx = localCx + c.x
    const ly = localCy + c.y
    return [lx * cos - ly * sin, lx * sin + ly * cos] as [number, number]
  })
  return {
    id: '',
    cx: pageCx,
    cy: pageCy,
    width: Math.max(1, b.w),
    height: Math.max(1, b.h),
    angle: -b.angle, // page angle vs local frame
    corners,
    paperColor: '#f5efe2',
    confidence: 0,
  }
}


function occlusionMask(
  raster: Raster,
  frame: RotatedFrame,
  paperColor: { r: number; g: number; b: number },
  feather = 2,
): Uint8Array {
  const { width, height, data } = raster
  const mask = new Uint8Array(width * height)
  // Build inverse rotation matrix to test points against the axis-aligned OBB.
  const rad = (frame.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hw = frame.width / 2
  const hh = frame.height / 2

  for (let y = Math.max(0, Math.floor(frame.cy - hh - feather)); y < Math.min(height, Math.ceil(frame.cy + hh + feather)); y++) {
    const row = y * width
    for (let x = Math.max(0, Math.floor(frame.cx - hw - feather)); x < Math.min(width, Math.ceil(frame.cx + hw + feather)); x++) {
      // Transform page point into frame-local space.
      const dx = x - frame.cx
      const dy = y - frame.cy
      const lx = dx * cos + dy * sin
      const ly = -dx * sin + dy * cos
      if (Math.abs(lx) > hw || Math.abs(ly) > hh) continue
      const i = (row + x) * 4
      if (data[i + 3] < 128) continue
      const dist = colourDistance({ r: data[i], g: data[i + 1], b: data[i + 2] }, paperColor)
      // Deviates significantly from paper → foreground ornament.
      if (dist > 35) {
        mask[row + x] = 255
      }
    }
  }
  // Feather edges with a simple box blur.
  if (feather > 0) {
    const feathered = new Uint8Array(width * height)
    const k = feather
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x] === 0) continue
        const x0 = Math.max(0, x - k), x1 = Math.min(width - 1, x + k)
        const y0 = Math.max(0, y - k), y1 = Math.min(height - 1, y + k)
        let sum = 0, count = 0
        for (let yy = y0; yy <= y1; yy++) {
          for (let xx = x0; xx <= x1; xx++) {
            sum += mask[yy * width + xx]
            count++
          }
        }
        feathered[y * width + x] = count > 0 ? Math.min(255, (sum / count) * 1.5) : 0
      }
    }
    return feathered
  }
  return mask
}

function maskToPngDataUrl(mask: Uint8Array, width: number, height: number, tint = 'rgba(0,0,0,0.6)'): string {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const id = ctx.createImageData(width, height)
  // Parse tint.
  const m = tint.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  const tr = m ? +m[1] : 0
  const tg = m ? +m[2] : 0
  const tb = m ? +m[3] : 0
  const ta = m && m[4] !== undefined ? +m[4] : 0.6
  for (let i = 0; i < id.data.length; i += 4) {
    const a = mask[i / 4]
    id.data[i] = tr
    id.data[i + 1] = tg
    id.data[i + 2] = tb
    id.data[i + 3] = a * ta
  }
  ctx.putImageData(id, 0, 0)
  return (canvas as any).toDataURL ? (canvas as any).toDataURL('image/png') : ''
}

function samplePaperColor(raster: Raster, frame: RotatedFrame): { r: number; g: number; b: number } {
  const { width, height, data } = raster
  const rad = (frame.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hw = Math.max(4, frame.width * 0.25)
  const hh = Math.max(4, frame.height * 0.25)
  let r = 0, g = 0, b = 0, n = 0
  for (let dy = -hh; dy <= hh; dy += 4) {
    for (let dx = -hw; dx <= hw; dx += 4) {
      const lx = dx * cos + dy * sin
      const ly = -dx * sin + dy * cos
      if (Math.abs(lx) > hw || Math.abs(ly) > hh) continue
      const px = Math.round(frame.cx + dx)
      const py = Math.round(frame.cy + dy)
      if (px < 0 || px >= width || py < 0 || py >= height) continue
      const i = (py * width + px) * 4
      if (data[i + 3] < 128) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n++
    }
  }
  if (n === 0) return { r: 245, g: 239, b: 226 } // warm mat default
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}


/**
 * Detect rotated photo frames in a flat template image and build occlusion overlays.
 *
 * Steps:
 *  1. Load image → raster.
 *  2. CIE L*a*b* adaptive paper segmentation (bright/cream regions).
 *  3. Connected components → candidate frame regions above min area.
 *  4. OBB reconstruction per component → rotated frame.
 *  5. Occlusion mask extraction → foreground overlay data URL per frame.
 *
 * Returns frames sorted by detection confidence.
 */
export async function detectSmartLayeredFrames(
  imageUrl: string,
  pageWidth: number,
  pageHeight: number,
  options: DeconstructorOptions = {},
): Promise<RotatedFrame[]> {
  const {
    minFrameArea = 0.02,
    paperLuminanceThreshold = 200,
    occlusionFeather = 2,
  } = options

  const raster = await loadImageAsRaster(imageUrl)
  const mask = paperMask(raster, paperLuminanceThreshold)
  const components = connectedComponents(mask, raster.width, raster.height)

  const pageArea = raster.width * raster.height
  const frames: RotatedFrame[] = []

  for (const comp of components) {
    const compArea = comp.bounds.width * comp.bounds.height
    if (compArea < pageArea * minFrameArea || compArea > pageArea * 0.9) continue
    if (comp.pixels.length < 60) continue

    let frame = minimumAreaRectangle(comp.pixels)
    // Clamp to page bounds.
    frame.cx = Math.min(Math.max(frame.cx, 0), pageWidth)
    frame.cy = Math.min(Math.max(frame.cy, 0), pageHeight)

    const paper = samplePaperColor(raster, frame)
    frame.paperColor = `rgb(${paper.r},${paper.g},${paper.b})`
    frame.id = `frame-${frames.length + 1}`
    frame.confidence = Math.min(1, comp.pixels.length / compArea)

    // Occlusion overlay.
    const occMask = occlusionMask(raster, frame, paper, occlusionFeather)
    frame.foregroundOverlayDataUrl = maskToPngDataUrl(occMask, raster.width, raster.height)

    frames.push(frame)
  }

  frames.sort((a, b) => b.confidence - a.confidence)
  return frames
}

export { type Component, minimumAreaRectangle, paperMask, occlusionMask, samplePaperColor, maskToPngDataUrl }





