/**
 * Camera Raw Adjustment Engine — direct pixel manipulation via Canvas 2D ImageData.
 * Zero CSS-filter fakery; all adjustments use per-pixel LUT / matrix math.
 */

export interface RawAdjustments {
  exposure: number   // -2.0 .. +2.0
  contrast: number   // 0.0 .. 3.0
  highlights: number // -1.0 .. +1.0 (scale >160)
  shadows: number    // -1.0 .. +1.0 (scale <90)
  saturation: number // 0.0 .. 3.0
  vibrance: number   // 0.0 .. 2.0
  sharpness: number  // 0.0 .. 3.0 (unsharp mask amount)
}

function hslToRgb(h: number, s: number, l: number) {
  let r = 0, g = 0, b = 0
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return [r, g, b]
}

export function applyExposure(data: ImageData, amount: number) {
  const d = data.data
  const factor = 1 + amount * 0.5
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, Math.round(d[i] * factor))
    d[i + 1] = Math.min(255, Math.round(d[i + 1] * factor))
    d[i + 2] = Math.min(255, Math.round(d[i + 2] * factor))
  }
}

export function applyContrast(data: ImageData, amount: number) {
  const d = data.data
  const mid = 0.5
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
    const cr = mid + (r - mid) * amount
    const cg = mid + (g - mid) * amount
    const cb = mid + (b - mid) * amount
    d[i] = Math.round(Math.max(0, Math.min(1, cr)) * 255)
    d[i + 1] = Math.round(Math.max(0, Math.min(1, cg)) * 255)
    d[i + 2] = Math.round(Math.max(0, Math.min(1, cb)) * 255)
  }
}

export function applyHighlightsShadows(data: ImageData, highlights: number, shadows: number) {
  const d = data.data
  const hThresh = 160 / 255
  const sThresh = 90 / 255
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const norm = lum / 255
    if (norm > hThresh) {
      const scale = 1 + highlights * 0.4
      d[i] = Math.min(255, Math.round(d[i] * scale))
      d[i + 1] = Math.min(255, Math.round(d[i + 1] * scale))
      d[i + 2] = Math.min(255, Math.round(d[i + 2] * scale))
    }
    if (norm < sThresh) {
      const scale = 1 + shadows * 0.4
      d[i] = Math.max(0, Math.round(d[i] * scale))
      d[i + 1] = Math.max(0, Math.round(d[i + 1] * scale))
      d[i + 2] = Math.max(0, Math.round(d[i + 2] * scale))
    }
  }
}

export function applySaturation(data: ImageData, amount: number) {
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const L = (max + min) / 2
    if (max === min) continue
    const S = L > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
    const newS = Math.min(1, S * amount)
    const [nr, ng, nb] = hslToRgb(((r + g + b) / 3), newS, L)
    d[i] = Math.round(nr * 255)
    d[i + 1] = Math.round(ng * 255)
    d[i + 2] = Math.round(nb * 255)
  }
}

export function applyVibrance(data: ImageData, amount: number) {
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const avg = (r + g + b) / 3
    const sat = (max - min) / 255
    const boost = amount * (1 - sat)
    d[i] = Math.min(255, Math.round(r + (r - avg) * boost))
    d[i + 1] = Math.min(255, Math.round(g + (g - avg) * boost))
    d[i + 2] = Math.min(255, Math.round(b + (b - avg) * boost))
  }
}

export function applyUnsharpMask(data: ImageData, amount: number) {
  const w = data.width, h = data.height
  const d = data.data
  // Simple 3x3 unsharp: blur + subtract scaled blur, add back to original (edge enhancement)
  // Implemented as per-pass approximation for speed
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4
      // Approximate Laplacian / edge enhancement via neighbor differences
      const c = (d[idx] + d[idx + 1] + d[idx + 2]) / 3
      const n = (d[idx - 4] + d[idx - 3] + d[idx - 2]) / 3
      const s = (d[idx + 4] + d[idx + 5] + d[idx + 6]) / 3
      const e = (d[idx + w * 4] + d[idx + w * 4 + 1] + d[idx + w * 4 + 2]) / 3
      const w_ = (d[idx - w * 4] + d[idx - w * 4 + 1] + d[idx - w * 4 + 2]) / 3
      const detail = (4 * c - n - s - e - w_) / 3
      const boost = amount * 0.5
      for (let ch = 0; ch < 3; ch++) {
        const base = d[idx + ch]
        d[idx + ch] = Math.max(0, Math.min(255, Math.round(base + detail * boost)))
      }
    }
  }
}

export function applyRawAdjustments(imgData: ImageData, adj: Partial<RawAdjustments>) {
  // Exposure
  if (adj.exposure) applyExposure(imgData, adj.exposure)
  // Contrast
  if (adj.contrast && adj.contrast !== 1) applyContrast(imgData, adj.contrast)
  // Highlights / Shadows
  if (adj.highlights || adj.shadows) applyHighlightsShadows(imgData, adj.highlights || 0, adj.shadows || 0)
  // Saturation / Vibrance
  if (adj.saturation && adj.saturation !== 1) applySaturation(imgData, adj.saturation)
  if (adj.vibrance && adj.vibrance !== 1) applyVibrance(imgData, adj.vibrance)
  // Sharpness (Unsharp Mask)
  if (adj.sharpness && adj.sharpness > 0) applyUnsharpMask(imgData, adj.sharpness / 2)
  return imgData
}
