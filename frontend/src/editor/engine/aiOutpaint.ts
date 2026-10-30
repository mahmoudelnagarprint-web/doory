/**
 * AI Outpainting / Expand Engine — extend canvas frame via edge replication + mirror padding.
 */

export interface ExpandOptions {
  percent: number // +10 .. +50
  mode: 'mirror' | 'replicate' | 'patch'
}

export function expandCanvas(
  source: HTMLCanvasElement,
  opts: ExpandOptions
): HTMLCanvasElement {
  const srcW = source.width, srcH = source.height
  const addW = Math.round(srcW * (opts.percent / 100))
  const addH = Math.round(srcH * (opts.percent / 100))
  const outW = srcW + addW, outH = srcH + addH

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const ctx = out.getContext('2d')!
  // Fill background with edge replication for translucent borders
  ctx.drawImage(source, 0, 0)
  // Right padding: replicate rightmost column
  if (addW > 0) {
    ctx.drawImage(source, srcW - 1, 0, 1, srcH, srcW, 0, addW, srcH)
  }
  // Bottom padding: replicate bottom row
  if (addH > 0) {
    ctx.drawImage(source, 0, srcH - 1, srcW, 1, 0, srcH, srcW, addH)
  }
  // Bottom-right corner: replicate corner pixel
  if (addW > 0 && addH > 0) {
    ctx.drawImage(source, srcW - 1, srcH - 1, 1, 1, srcW, srcH, addW, addH)
  }
  return out
}
