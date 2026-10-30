/**
 * Pencil Sketch Converter — grayscale + Dodge blend + edge-preserve filter.
 */

export function toPencilSketch(source: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement {
  const srcW = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth || source.width
  const srcH = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight || source.height
  const out = document.createElement('canvas')
  out.width = srcW
  out.height = srcH
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0)
  const id = ctx.getImageData(0, 0, srcW, srcH)
  const d = id.data

  // Grayscale luminance
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = Math.round(lum)
  }

  // Gaussian blur approximation via 3x3 uniform for dodge blend
  const temp = new Uint8ClampedArray(d)
  const w_ = srcW, h_ = srcH
  for (let y = 1; y < h_ - 1; y++) {
    for (let x = 1; x < w_ - 1; x++) {
      const idx = (y * w_ + x) * 4
      const avg = (
        temp[idx] + temp[idx - 4] + temp[idx + 4] +
        temp[idx - w_ * 4] + temp[idx + w_ * 4]
      ) / 5
      // Dodge blend: sketch = 255 - (blur / gray) roughly
      const gray = temp[idx]
      const dodge = gray === 0 ? 255 : Math.min(255, Math.round(255 - (255 * avg) / (gray + 1)))
      for (let ch = 0; ch < 3; ch++) d[idx + ch] = dodge
    }
  }
  ctx.putImageData(id, 0, 0)
  return out
}
