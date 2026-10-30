/**
 * Design Decomposer — provider resolution.
 *
 * The caller never has to know which engine will run: it offers a preferred provider (tests inject
 * deterministic ones), and this module falls back in a way that is always honest — the returned
 * `SegmentationProvider.neural` flag and the emitted warnings say exactly what ran.
 *
 * Resolution never fails. Quality is communicated, not hidden: a classical fallback always carries the
 * `model-unavailable` and `classical-fallback` warnings.
 *
 * `modelProvider` is imported lazily here so that a caller which only imports this module for the
 * registry helpers (the app's config path) never pulls the ONNX runtime into the initial bundle.
 */
import { BackgroundRemovalError } from '@/editor/engine/bgRemoval'
import { exemplarInpaintProvider } from '../inpaint'
import type { InpaintProvider, PipelineWarning, SegmentationProvider } from '../types'
import { createClassicalSegmentationProvider } from './classicalProvider'

export interface ResolvedSegmentation {
  provider: SegmentationProvider
  warnings: PipelineWarning[]
}

export { createClassicalSegmentationProvider } from './classicalProvider'
export { exemplarInpaintProvider } from '../inpaint'
export { configureDeconstructorModel, deconstructorModel } from './modelRegistry'
export { createModelSegmentationProvider } from './modelProvider'
export type { ModelProviderDeps, ModelSegmentationProvider } from './modelProvider'

const MODEL_UNAVAILABLE: PipelineWarning = {
  code: 'model-unavailable',
  message:
    'نموذج التقسيم العصبي غير مثبَّت على هذا الخادم (assets.background_removal_model)، لذلك سيتم استخدام التحليل الكلاسيكي للألوان.',
}

const CLASSICAL_FALLBACK: PipelineWarning = {
  code: 'classical-fallback',
  message:
    'تم استخدام التقسيم الكلاسيكي بدون شبكة عصبية؛ العناصر تُستخرج من الألوان والحدود وقد تكون أقل دقة من النموذج العصبي.',
}

/** `isAvailable` may throw in a hostile environment; an unavailable provider is never a fatal error. */
async function isUsable(provider: SegmentationProvider): Promise<boolean> {
  try {
    return await provider.isAvailable()
  } catch {
    return false
  }
}

/**
 * Picks the segmentation engine: the caller's preferred provider when it can run, otherwise the real
 * neural provider, otherwise the classical one with the two fallback warnings attached.
 */
export async function resolveSegmentationProvider(
  preferred?: SegmentationProvider,
  signal?: AbortSignal,
): Promise<ResolvedSegmentation> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (preferred && (await isUsable(preferred))) {
    return { provider: preferred, warnings: [] }
  }
  const { createModelSegmentationProvider } = await import('./modelProvider')
  const model = createModelSegmentationProvider()
  if (await isUsable(model)) {
    return { provider: model, warnings: [] }
  }
  return {
    provider: createClassicalSegmentationProvider(),
    warnings: [MODEL_UNAVAILABLE, CLASSICAL_FALLBACK],
  }
}

/** Picks the inpainting engine: the preferred one when available, otherwise the exemplar provider. */
export async function resolveInpaintProvider(preferred?: InpaintProvider): Promise<InpaintProvider> {
  if (preferred) {
    try {
      if (await preferred.isAvailable()) return preferred
    } catch {
      // an engine that cannot even answer is not usable
    }
  }
  if (await exemplarInpaintProvider.isAvailable()) return exemplarInpaintProvider
  throw new BackgroundRemovalError('No inpainting engine is available.', 'unavailable')
}
