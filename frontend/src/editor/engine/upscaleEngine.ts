/**
 * AI Upscale & Super-Resolution Simulation Engine
 * Multi-pass bicubic + sharpening to simulate Real-ESRGAN / SwinIR locally.
 */

export interface UpscaleOptions {
  scale: 2 | 4
  sharpening: number // 0..2
}

export async function upscaleImage(
  source: HTMLCanvasElement | HTMLImageElement,
  opts: UpscaleOptions,
  onProgress?: (pct: number) => void
): Promise<HTMLCanvasElement> {
  const srcW = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth || source.width
  const srcH = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight || source.height
  const targetW = Math.round(srcW * opts.scale)
  const targetH = Math.round(srcH * opts.scale)

  // Pass 1: high-quality bicubic scaling via intermediate canvas
  const pass1 = document.createElement('canvas')
  pass1.width = Math.round(srcW * 1.5)
  pass1.height = Math.round(srcH * 1.5)
  const ctx1 = pass1.getContext('2d', { willReadFrequently: true })!
  ctx1.imageSmoothingEnabled = true
  ctx1.imageSmoothingQuality = 'high'
  ctx1.drawImage(source, 0, 0, pass1.width, pass1.height)
  if (onProgress) onProgress(35)

  // Pass 2: final target scale
  const out = document.createElement('canvas')
  out.width = targetW
  out.height = targetH
  const ctx2 = out.getContext('2d', { willReadFrequently: true })!
  ctx2.imageSmoothingEnabled = true
  ctx2.imageSmoothingQuality = 'high'
  ctx2.drawImage(pass1, 0, 0, out.width, out.height)
  if (onProgress) onProgress(70)

  // Pass 3: sharpening simulation (Unsharp Mask via 2D convolution approximation)
  if (opts.sharpening > 0) {
    const imgData = ctx2.getImageData(0, 0, out.width, out.height)
    const amount = opts.sharpening / 2
    const W = out.width, h_ = out.height
    for (let y = 1; y < h_ - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = (y * W + x) * 4
        const cR = imgData.data[idx], cG = imgData.data[idx + 1], cB = imgData.data[idx + 2]
        const n = (imgData.data[idx - 4] + imgData.data[idx - 3] + imgData.data[idx - 2]) / 3
        const s = (imgData.data[idx + 4] + imgData.data[idx + 5] + imgData.data[idx + 6]) / 3
        const e = (imgData.data[idx + W * 4] + imgData.data[idx + W * 4 + 1] + imgData.data[idx + W * 4 + 2]) / 3
        const west = (imgData.data[idx - W * 4] + imgData.data[idx - W * 4 + 1] + imgData.data[idx - W * 4 + 2]) / 3
        const detail = (4 * ((cR + cG + cB) / 3) - n - s - e - west) / 3
        const boost = amount * 0.8
        for (let ch = 0; ch < 3; ch++) {
          const base = imgData.data[idx + ch]
          imgData.data[idx + ch] = Math.max(0, Math.min(255, Math.round(base + detail * boost)))
        }
      }
    }
    ctx2.putImageData(imgData, 0, 0)
  }
  if (onProgress) onProgress(100)
  return out
}
