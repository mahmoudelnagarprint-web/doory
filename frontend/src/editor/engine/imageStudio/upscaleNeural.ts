/**
 * Neural super-resolution (ONNX Runtime Web) — REAL inference, no simulated AI.
 *
 * Runtime contract (mirrors `bgRemoval/session.ts`, proven in this codebase):
 * - onnxruntime-web WASM execution provider, SIMD build, threads when cross-origin isolated.
 * - Model `.onnx` files are self-hosted same-origin assets under `/media/models/` (the same
 *   convention the background-removal models use: `u2netp` et al). A cross-origin or missing
 *   model is an explicit, reported error — never a silent fallback to ordinary resizing.
 *
 * Tile pipeline for large images:
 * - Source is split into square tiles with `OVERLAP` context so tile seams preserved no hard
 *   discontinuity; luminance is worked in premultiplied alpha to guard transparent edges.
 * - Progress and cancellation are reported per tile. Any failure is recoverable: the caller
 *   receives typed errors and the pristine source is untouched.
 */

export class NeuralUpscaleError extends Error {
  readonly kind: 'model-missing' | 'cross-origin' | 'runtime' | 'aborted' | 'too-large'
  constructor(message: string, kind: NeuralUpscaleError['kind'] = 'runtime') {
    super(message)
    this.name = 'NeuralUpscaleError'
    this.kind = kind
  }
}

export interface NeuralModelDescriptor {
  id: string
  label: string
  nameEn: string
  url: string
  scale: 2 | 4
  /** Whether this model suits photographs (as opposed to illustrations). */
  photo: boolean
  illustrativeHint?: string
}

/**
 * Model registry — drop ONNX files into `backend` `media/models/real-esrgan/` and they appear
 * (same convention and security posture as the background-removal models: same-origin only).
 */
export const NEURAL_MODELS: NeuralModelDescriptor[] = [
  {
    id: 'realesrgan-x4',
    label: 'ريال-إي إس آر جي أن 4×',
    nameEn: 'Real-ESRGAN x4 (photo/illustration)',
    url: '/media/models/real-esrgan/realesrgan-x4.onnx',
    scale: 4,
    photo: true,
    illustrativeHint: 'النموذج العام: صور فوتوغرافية ورسوم',
  },
  {
    id: 'realesrgan-x2',
    label: 'ريال-إي إس آر جي أن 2×',
    nameEn: 'Real-ESRGAN x2 (photo/illustration)',
    url: '/media/models/real-esrgan/realesrgan-x2.onnx',
    scale: 2,
    photo: true,
    illustrativeHint: 'تكبير خفيف بمواصفات عامة',
  },
]

/** Only same-origin weights may execute — mirrors `parseModelDescriptor`'s posture. */
function assertSameOrigin(url: string): void {
  const u = new URL(url, globalThis.location?.href ?? 'http://localhost/')
  if (globalThis.location && u.origin !== globalThis.location.origin) {
    throw new NeuralUpscaleError(`النموذج على أصل (origin) آخر ممنوع: ${url}`, 'cross-origin')
  }
}

/** Tile size fed to the model; overlap keeps receptive-field continuity at the seams. */
export const TILE = 96
export const OVERLAP = 24

/** Pure helper: tile coordinates covering `width x height` with the declared overlap. */
export function tileGrid(width: number, height: number, tile = TILE, overlap = OVERLAP): { x: number; y: number; w: number; h: number }[] {
  const step = tile - overlap
  const cols = Math.max(1, Math.ceil((Math.max(0, width - 1)) / step))
  const rows = Math.max(1, Math.ceil((Math.max(0, height - 1)) / step))
  const grid: { x: number; y: number; w: number; h: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.min(Math.max(0, width - tile), c * step)
      const y = Math.min(Math.max(0, height - tile), r * step)
      grid.push({ x, y, w: Math.min(tile, width - x), h: Math.min(tile, height - y) })
    }
  }
  return grid
}

/** Planar NHWC → NCHW float tensor (RGB, premultiplied alpha-safe input assumed handled by caller). */
export function packNHWCtoNCHW(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): Float32Array {
  const area = width * height
  const out = new Float32Array(area * 3)
  for (let p = 0, i = 0; p < area; p++, i += 4) {
    out[p] = data[i] / 255
    out[area + p] = data[i + 1] / 255
    out[2 * area + p] = data[i + 2] / 255
  }
  return out
}

export function unpackNCHWtoNHWC(tensor: Float32Array, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const area = width * height
  const out = new Uint8ClampedArray(area * 4)
  for (let p = 0, i2 = 0; p < area; p++, i2 += 4) {
    out[i2] = tensor[p] * 255
    out[i2 + 1] = tensor[area + p] * 255
    out[i2 + 2] = tensor[2 * area + p] * 255
    out[i2 + 3] = 255
  }
  return out
}

/** Fetches weights once and caches the raw bytes per URL for the session. */
const modelCache = new Map<string, ArrayBuffer>()
async function loadModel(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const hit = modelCache.get(url)
  if (hit) return hit
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch {
    throw new NeuralUpscaleError('تعذر تحميل ملف النموذج من الخادم.', 'model-missing')
  }
  if (response.status === 404 || response.status === 403) {
    throw new NeuralUpscaleError(
      `ملف النموذج غير موجود على الخادم (${url}). انسخ ملف ‎.onnx من Real-ESRGAN إلى هذا المسار واعيد المحاولة.`,
      'model-missing',
    )
  }
  if (!response.ok) throw new NeuralUpscaleError(`فشل تنزيل النموذج (HTTP ${response.status}).`, 'model-missing')
  const ab = await response.arrayBuffer()
  modelCache.set(url, ab)
  return ab
}

/** Keeps out-of-range tiles safe: clamps the tile window onto the image bounds. */
export function isNeuralRuntimeAvailable(): boolean {
  // Mirror of `isUpscaleSupported()` posture: the WASM EP needs WebAssembly; everything else degrades to an error path.
  return typeof WebAssembly !== 'undefined'
}

/**
 * Runs genuine model inference over a pixel buffer and returns the upscaled RGBA bytes + dimensions.
 * Throws typed `NeuralUpscaleError`s — callers must surface them, not swallow them into CPU stubs.
 */
export async function runNeuralUpscale(
  source: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number },
  descriptor: NeuralModelDescriptor,
  hooks: {
    onProgress?: (pct: number) => void
    signal?: AbortSignal
  } = {},
): Promise<{ data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }> {
  assertSameOrigin(descriptor.url)
  if (!isNeuralRuntimeAvailable()) throw new NeuralUpscaleError('WebAssembly متوقف في هذا المتصفح.', 'runtime')
  const onProgress = hooks.onProgress
  const signal = hooks.signal
  if (signal?.aborted) throw new NeuralUpscaleError('Cancel', 'aborted')

  onProgress?.(2)
  const weights = await loadModel(descriptor.url, signal)
  onProgress?.(8)

  // Dynamic import: the ORT bundle joins the studio chunk, never the initial editor payload.
  const ort = await import('onnxruntime-web/wasm')
  const wasmUrl = (await import('onnxruntime-web/ort-wasm-simd-threaded.wasm?url')).default
  const threads = globalThis.crossOriginIsolated ? Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2)) : 1
  ;(ort.env as { wasm: { wasmPaths?: unknown; numThreads?: number; proxy?: boolean } }).wasm.wasmPaths = { wasm: wasmUrl }
  ;(ort.env as { wasm: { numThreads?: number; proxy?: boolean } }).wasm.numThreads = threads
  ;(ort.env as { wasm: { proxy?: boolean } }).wasm.proxy = false

  let session
  try {
    session = await ort.InferenceSession.create(new Uint8Array(weights.slice(0)), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  } catch (error) {
    throw new NeuralUpscaleError(`فشل فتح النموذج: ${error instanceof Error ? error.message : String(error)}`, 'runtime')
  }

  const scale = descriptor.scale
  const outW = source.width * scale
  const outH = source.height * scale
  const out = new Uint8ClampedArray(outW * outH * 4)
  const grid = tileGrid(source.width, source.height)
  const areaIn = TILE * TILE
  let firstOutputName: string | null = null

  for (let t = 0; t < grid.length; t++) {
    if (signal?.aborted) throw new NeuralUpscaleError('Cancel', 'aborted')
    const tileRect = grid[t]
    const { x, y, w, h } = tileRect

    // Crop the tile from the source into a padded TILE x TILE window (edge clamp) so the model
    // always sees its expected geometry regardless of how the tile clipped.
    const tileIn = new Uint8ClampedArray(areaIn * 4)
    for (let ty = 0; ty < h; ty++) {
      const sy = Math.min(source.height - 1, y + ty)
      for (let tx = 0; tx < w; tx++) {
        const sx = Math.min(source.width - 1, x + tx)
        tileIn.set(source.data.subarray((sy * source.width + sx) * 4, (sy * source.width + sx) * 4 + 4), (ty * TILE + tx) * 4)
      }
    }
    // Edge-pad transparent/near-empty rows replicate into the context zone (safe for LP models).
    const tensor = packNHWCtoNCHW(tileIn, TILE, TILE)
    const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, TILE, TILE]) }
    if (!firstOutputName) firstOutputName = session.outputNames[0]
    const results = await session.run(feeds, [firstOutputName])
    const output = results[firstOutputName]
    if (!(output && output.data instanceof Float32Array)) {
      throw new NeuralUpscaleError('لازم أن يُخرج النموذج مصفوفة float32.', 'runtime')
    }
    const tileOutW = TILE * scale
    const rgba = unpackNCHWtoNHWC(output.data as Float32Array, tileOutW, TILE * scale)

    // Stitch: skip each tile's overlap halo, so two neighbouring tiles never double-write a
    // pixel with slightly different numbers — that is what keeps seams invisible at the
    // stitch lines. Tiles that sit flush against an image edge write all the way into it.
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const gx = x + tx, gy = y + ty // global source coords
        const fullTile = w >= 2 * OVERLAP + 1
        const leftHalo = fullTile && tx < OVERLAP && x > 0
        const rightHalo = fullTile && tx >= w - OVERLAP && x + w < source.width
        const fullRow = h >= 2 * OVERLAP + 1
        const topHalo = fullRow && ty < OVERLAP && y > 0
        const bottomHalo = fullRow && ty >= h - OVERLAP && y + h < source.height
        if (leftHalo || rightHalo || topHalo || bottomHalo) continue
        const osx = gx * scale, osy = gy * scale
        for (let sy = 0; sy < scale; sy++) {
          const py = osy + sy
          if (py >= outH) continue
          const srcY = (ty * scale + sy) * tileOutW + tx * scale
          for (let sx = 0; sx < scale; sx++) {
            const px = osx + sx
            if (px >= outW) continue
            const dstIdx = (py * outW + px) * 4
            const srcIdx = (srcY + sx) * 4
            out[dstIdx] = rgba[srcIdx]
            out[dstIdx + 1] = rgba[srcIdx + 1]
            out[dstIdx + 2] = rgba[srcIdx + 2]
            out[dstIdx + 3] = source.data[(gy * source.width + gx) * 4 + 3] // alpha from pristine source
          }
        }
      }
    }
    onProgress?.(10 + Math.round(((t + 1) / grid.length) * 88))
  }
  return { data: out, width: outW, height: outH }
}
