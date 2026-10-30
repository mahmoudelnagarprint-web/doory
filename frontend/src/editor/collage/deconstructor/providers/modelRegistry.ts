/**
 * Design Decomposer — the registered neural model descriptor.
 *
 * This module is deliberately tiny and has **no** runtime dependency beyond a type: it is reached from
 * the app's config handler, which runs on every page load, so importing it must never pull the ONNX
 * runtime (or the wasm asset) into the initial bundle. The descriptor itself, the parser that validates
 * it and the inference session live in `engine/bgRemoval` and are loaded lazily by `modelProvider`.
 *
 * Replacing the descriptor bumps a generation counter and notifies subscribers, which is how the
 * provider knows to drop (and therefore release) the session it had cached for the previous model.
 */
import { sameModel, type ModelDescriptor } from '@/editor/engine/bgRemoval/model'

let descriptor: ModelDescriptor | null = null
let generation = 0
const listeners = new Set<() => void>()

/** Registers (or clears) the descriptor the server advertises under `assets.background_removal_model`. */
export function configureDeconstructorModel(model: ModelDescriptor | null): void {
  const unchanged = model === null || descriptor === null ? model === descriptor : sameModel(model, descriptor)
  if (unchanged) return
  descriptor = model
  generation++
  for (const listener of Array.from(listeners)) listener()
}

/** The descriptor currently registered, or `null` when the feature has no model installed. */
export function deconstructorModel(): ModelDescriptor | null {
  return descriptor
}

/** Monotonic counter: any change to the descriptor invalidates a cached session. */
export function deconstructorModelGeneration(): number {
  return generation
}

/** Subscribes to descriptor changes; the returned function unsubscribes. */
export function onDeconstructorModelChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
