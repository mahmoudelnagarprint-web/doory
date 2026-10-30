/**
 * Design Decomposer — the real neural segmentation provider.
 *
 * Everything heavy is imported **inside** `segment()`: the ONNX runtime session factory, the verified
 * model store and the wasm asset URL. `isAvailable()` stays cheap and imports nothing, because this
 * module is reachable from the app's config path that runs on every page load; the app's bundle budget
 * only survives if the runtime is loaded when a user actually decomposes an image.
 *
 * The pipeline it drives is the project's already-shipped, verified inference stack
 * (`engine/bgRemoval/{session,modelStore,pipeline}`): the model bytes are downloaded and hash-checked
 * by `loadModel`, the session is created by `createSegmenter`, and `cutOut` turns the model's matte into
 * real per-pixel coverage. Nothing here re-implements inference.
 */
import { BackgroundRemovalError } from '@/editor/engine/bgRemoval'
import type { ModelDescriptor } from '@/editor/engine/bgRemoval/model'
import type { Segmenter } from '@/editor/engine/bgRemoval/session'
import type { SegmentationOutput, SegmentationProvider, SegmentationRequest } from '../types'
import { deconstructorModel, deconstructorModelGeneration, onDeconstructorModelChange } from './modelRegistry'

export interface ModelProviderDeps {
  /** Test seam for the model bytes; defaults to the verified `loadModel` (cache + SHA-256 check). */
  loadModel?: typeof import('@/editor/engine/bgRemoval/modelStore').loadModel
  /** Overrides the bundler-provided wasm asset URL (defaults to the build's own `ort-wasm-simd-threaded.wasm`). */
  wasmUrl?: string
}

/** The neural provider plus the lifecycle hook the app needs; it is assignable to `SegmentationProvider`. */
export interface ModelSegmentationProvider extends SegmentationProvider {
  /** Drops the cached session and stops watching the registry. */
  dispose(): void
}

interface CachedSession {
  generation: number
  key: string
  promise: Promise<Segmenter>
}

/**
 * The smallest valid WebAssembly module (the bare 8 byte header). Compiling it is a real capability
 * probe: a page whose CSP forbids WebAssembly throws here, and the caller falls back honestly.
 */
const WASM_HEADER = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])

function webAssemblyUsable(): boolean {
  try {
    return typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function' && WebAssembly.validate(WASM_HEADER)
  } catch {
    return false
  }
}

function abortError(): Error {
  return new DOMException('Aborted', 'AbortError')
}

function defaultThreads(): number {
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  const cores = typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency || 1
  return isolated ? Math.max(1, Math.min(4, cores)) : 1
}

/** Key identifying the exact model file a cached session was built from. */
function modelKey(descriptor: ModelDescriptor): string {
  return `${descriptor.id}|${descriptor.sha256}`
}

/**
 * Creates the neural segmentation provider.
 *
 * `isAvailable()` is true only when a descriptor is registered, WebAssembly exists and the runtime can
 * actually validate a module. `segment()` throws a `BackgroundRemovalError` when no model is
 * registered, when the download fails verification, or when the model finds no subject — it never
 * returns a blank mask as if it had worked.
 */
export function createModelSegmentationProvider(deps: ModelProviderDeps = {}): ModelSegmentationProvider {
  let cached: CachedSession | null = null
  const stopWatching = onDeconstructorModelChange(() => {
    cached = null
  })
  let disposed = false

  async function sessionFor(descriptor: ModelDescriptor, request: SegmentationRequest): Promise<Segmenter> {
    const generation = deconstructorModelGeneration()
    const key = modelKey(descriptor)
    if (cached && cached.generation === generation && cached.key === key) return cached.promise
    const promise = (async (): Promise<Segmenter> => {
      const [{ createSegmenter }, { loadModel }, wasmAsset] = await Promise.all([
        import('@/editor/engine/bgRemoval/session'),
        import('@/editor/engine/bgRemoval/modelStore'),
        import('onnxruntime-web/ort-wasm-simd-threaded.wasm?url'),
      ])
      const load = deps.loadModel ?? loadModel
      const bytes = await load(
        descriptor,
        (phase, percent) => {
          // The download is the first 5..30% of the stage; inference reports the rest itself.
          request.onProgress?.(Math.min(30, 5 + Math.round((phase === 'downloading' ? percent : 100) * 0.25)))
        },
        request.signal,
      )
      if (request.signal?.aborted) throw abortError()
      const wasmUrl = deps.wasmUrl ?? wasmAsset.default
      return createSegmenter(bytes, descriptor, wasmUrl, defaultThreads())
    })()
    cached = { generation, key, promise }
    // A failed load must not be cached as if it had succeeded.
    promise.catch(() => {
      if (cached?.promise === promise) cached = null
    })
    return promise
  }

  return {
    id: 'model',
    neural: true,

    async isAvailable(): Promise<boolean> {
      if (disposed) return false
      return deconstructorModel() !== null && webAssemblyUsable()
    },

    async segment(request: SegmentationRequest): Promise<SegmentationOutput> {
      if (disposed) throw new BackgroundRemovalError('The segmentation provider was disposed.', 'unavailable')
      const descriptor = deconstructorModel()
      if (!descriptor) {
        throw new BackgroundRemovalError(
          'No neural segmentation model is registered (assets.background_removal_model in the server config).',
          'unavailable',
        )
      }
      const { raster } = request
      if (raster.width <= 0 || raster.height <= 0 || raster.data.length < raster.width * raster.height * 4) {
        throw new BackgroundRemovalError('The image has no usable pixels to segment.', 'unavailable')
      }
      if (request.signal?.aborted) throw abortError()
      request.onProgress?.(5)

      const segmenter = await sessionFor(descriptor, request)
      if (request.signal?.aborted) throw abortError()

      // `cutOut` writes the matte into the alpha channel, so it must never see the caller's raster.
      const copy = new Uint8ClampedArray(raster.data.length)
      copy.set(raster.data)
      const { cutOut } = await import('@/editor/engine/bgRemoval/pipeline')
      await cutOut(copy, raster.width, raster.height, descriptor.input, {
        infer: (input) => segmenter.run(input),
        step: async (percent) => {
          if (request.signal?.aborted) throw abortError()
          request.onProgress?.(Math.min(99, 30 + Math.round(percent * 0.65)))
        },
      })

      const foreground = new Uint8Array(raster.width * raster.height)
      let covered = 0
      for (let i = 0; i < foreground.length; i++) {
        const alpha = copy[i * 4 + 3]
        foreground[i] = alpha
        if (alpha > 0) covered++
      }
      if (covered === 0) {
        throw new BackgroundRemovalError('The model returned an empty mask.', 'no-subject')
      }
      request.onProgress?.(100)
      return {
        foreground,
        width: raster.width,
        height: raster.height,
        neural: true,
        modelId: descriptor.id,
      }
    },

    dispose(): void {
      disposed = true
      cached = null
      stopWatching()
    },
  }
}
