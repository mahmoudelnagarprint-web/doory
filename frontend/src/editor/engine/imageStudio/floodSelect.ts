/**
 * Classical flood-fill selection (NOT AI). Pure array operation.
 * Selects contiguous region from seed point with RGB tolerance.
 * Result: binary mask (Uint8ClampedArray, 0/255) same size as source.
 */
export function floodSelect(
  source: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number },
  seedX: number,
  seedY: number,
  tolerance: number, // 0..255 per channel
): Uint8ClampedArray<ArrayBuffer> {
  const w = source.width
  const h = source.height
  const mask = new Uint8ClampedArray(w * h)
  const visited = new Uint8Array(w * h)
  const stack = [{ x: seedX, y: seedY }]

  const seedIdx = (seedY * w + seedX) * 4
  const sr = source.data[seedIdx]
  const sg = source.data[seedIdx + 1]
  const sb = source.data[seedIdx + 2]

  while (stack.length > 0) {
    const p = stack.pop()!
    const idx = p.y * w + p.x
    if (visited[idx]) continue
    visited[idx] = 1

    const off = idx * 4
    const r = source.data[off]
    const g = source.data[off + 1]
    const b = source.data[off + 2]

    if (Math.abs(r - sr) <= tolerance && Math.abs(g - sg) <= tolerance && Math.abs(b - sb) <= tolerance) {
      mask[idx] = 255
      if (p.x > 0) stack.push({ x: p.x - 1, y: p.y })
      if (p.x < w - 1) stack.push({ x: p.x + 1, y: p.y })
      if (p.y > 0) stack.push({ x: p.x, y: p.y - 1 })
      if (p.y < h - 1) stack.push({ x: p.x, y: p.y + 1 })
    }
  }
  return mask
}

export function maskToCanvasBit(mask: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const v = mask[i]
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}
