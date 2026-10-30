/**
 * Camera Raw Studio — the non-destructive adjustment contract.
 *
 * All values are absolute scene parameters, never deltas of a previous state: the GPU pipeline
 * always renders the pristine source texture with these uniforms, so repeated slider moves
 * never accumulate degradation, and every control has an exact reset value.
 */

/** One control's numeric domain. `reset` must be inside `[min, max]`. */
export interface ControlSpec {
  key: StudioParamKey
  min: number
  max: number
  step: number
  reset: number
}

export type StudioParamKey =
  // LIGHT: إضاءة
  | 'exposure'      // -2 .. +2 stops
  | 'brightness'    // -1 .. +1
  | 'contrast'      // -1 .. +1 (pivot 0.5 sRGB)
  | 'gamma'         // 0.2 .. 3, default 1
  | 'whites'        // -1 .. +1 (white-point nudge)
  | 'blacks'        // -1 .. +1 (black-point nudge)
  | 'highlights'    // -1 .. +1
  | 'shadows'       // -1 .. +1
  | 'blackPoint'    // 0 .. 0.25 (input black clipping)
  | 'whitePoint'    // 0 .. 0.25 (input white clipping)
  // COLOR: لون
  | 'temperature'   // -1 (cool/blue) .. +1 (warm/orange)
  | 'tint'          // -1 (green) .. +1 (magenta)
  | 'saturation'    // -1 .. +2 (relative scale 0..3)
  | 'vibrance'      // -1 .. +1
  | 'hue'           // -180 .. +180 degrees
  // DETAIL: تفاصيل
  | 'sharpness'     // 0 .. 2 (unsharp amount)
  | 'denoise'       // 0 .. 1
  | 'clarity'       // -1 .. +1 (wide-radius local contrast)
  | 'texture'       // -1 .. +1 (mid-radius local contrast)
  | 'dehaze'        // 0 .. 1
  // OPTICS AND FINISHING: تشطيب
  | 'vignette'      // -1 .. +1 (negative = darker corners)
  | 'grain'         // 0 .. 1

export const CONTROL_ORDER: StudioParamKey[] = [
  'exposure', 'brightness', 'contrast', 'gamma', 'whites', 'blacks', 'highlights', 'shadows', 'blackPoint', 'whitePoint',
  'temperature', 'tint', 'saturation', 'vibrance', 'hue',
  'sharpness', 'denoise', 'clarity', 'texture', 'dehaze',
  'vignette', 'grain',
]

export const CONTROLS: Record<StudioParamKey, ControlSpec> = {
  exposure:    { key: 'exposure',    min: -2,   max: 2,   step: 0.01, reset: 0 },
  brightness:  { key: 'brightness',  min: -1,   max: 1,   step: 0.01, reset: 0 },
  contrast:    { key: 'contrast',    min: -1,   max: 1,   step: 0.01, reset: 0 },
  gamma:       { key: 'gamma',       min: 0.2,  max: 3,   step: 0.01, reset: 1 },
  whites:      { key: 'whites',      min: -1,   max: 1,   step: 0.01, reset: 0 },
  blacks:      { key: 'blacks',      min: -1,   max: 1,   step: 0.01, reset: 0 },
  highlights:  { key: 'highlights',  min: -1,   max: 1,   step: 0.01, reset: 0 },
  shadows:     { key: 'shadows',     min: -1,   max: 1,   step: 0.01, reset: 0 },
  blackPoint:  { key: 'blackPoint',  min: 0,    max: 0.25,step: 0.001, reset: 0 },
  whitePoint:  { key: 'whitePoint',  min: 0,    max: 0.25,step: 0.001, reset: 0 },
  temperature: { key: 'temperature', min: -1,   max: 1,   step: 0.01, reset: 0 },
  tint:        { key: 'tint',        min: -1,   max: 1,   step: 0.01, reset: 0 },
  saturation:  { key: 'saturation',  min: -1,   max: 2,   step: 0.01, reset: 0 },
  vibrance:    { key: 'vibrance',    min: -1,   max: 1,   step: 0.01, reset: 0 },
  hue:         { key: 'hue',         min: -180, max: 180, step: 1,    reset: 0 },
  sharpness:   { key: 'sharpness',   min: 0,    max: 2,   step: 0.01, reset: 0 },
  denoise:     { key: 'denoise',     min: 0,    max: 1,   step: 0.01, reset: 0 },
  clarity:     { key: 'clarity',     min: -1,   max: 1,   step: 0.01, reset: 0 },
  texture:     { key: 'texture',     min: -1,   max: 1,   step: 0.01, reset: 0 },
  dehaze:      { key: 'dehaze',      min: 0,    max: 1,   step: 0.01, reset: 0 },
  vignette:    { key: 'vignette',    min: -1,   max: 1,   step: 0.01, reset: 0 },
  grain:       { key: 'grain',       min: 0,    max: 1,   step: 0.01, reset: 0 },
}

export type StudioParams = Record<StudioParamKey, number>

export const DEFAULT_PARAMS: StudioParams = Object.fromEntries(
  CONTROL_ORDER.map((key) => [key, CONTROLS[key].reset]),
) as StudioParams

export function isDefaultParams(params: StudioParams): boolean {
  return CONTROL_ORDER.every((key) => params[key] === CONTROLS[key].reset)
}

/** Clamps every control into its declared domain — sliders bind this too. */
export function clampParams(params: StudioParams): StudioParams {
  const out = { ...params }
  for (const key of CONTROL_ORDER) {
    const spec = CONTROLS[key]
    out[key] = Math.min(spec.max, Math.max(spec.min, Number.isFinite(out[key]) ? out[key] : spec.reset))
  }
  return out
}

/** True when a value diff needs a GPU pass — used to skip redundant renders. */
export function paramsEqual(a: StudioParams, b: StudioParams): boolean {
  return CONTROL_ORDER.every((key) => a[key] === b[key])
}

/** Snapshot for the studio's undo/redo stack: plain JSON data, cheap to clone. */
export function serializeParams(params: StudioParams): string {
  return JSON.stringify(CONTROL_ORDER.map((key) => params[key]))
}

export function restoreParams(json: string): StudioParams {
  const values = JSON.parse(json) as number[]
  return clampParams(Object.fromEntries(CONTROL_ORDER.map((key, i) => [key, values[i] ?? CONTROLS[key].reset])) as StudioParams)
}

export type PresetId = 'neutral' | 'portrait' | 'cinematic' | 'vivid' | 'mono' | 'hdr'

export interface PresetDescriptor {
  id: PresetId
  label: string      // Arabic label, English technical name in the UI
  nameEn: string
  params: Partial<StudioParams>
}

export const PRESETS: PresetDescriptor[] = [
  { id: 'neutral',   label: 'طبيعي',    nameEn: 'Neutral',    params: {} },
  { id: 'portrait',  label: 'بورتريه',  nameEn: 'Portrait',   params: { exposure: 0.1, shadows: 0.25, vibrance: 0.2, denoise: 0.2, clarity: 0.05 } },
  { id: 'cinematic', label: 'سينمائي',  nameEn: 'Cinematic',  params: { contrast: 0.18, highlights: -0.3, shadows: 0.2, temperature: -0.12, vibrance: 0.12, vignette: -0.25, clarity: 0.1 } },
  { id: 'vivid',     label: 'حيوي',     nameEn: 'Vivid',      params: { exposure: 0.05, contrast: 0.2, vibrance: 0.45, saturation: 0.12, clarity: 0.15, sharpness: 0.35 } },
  { id: 'mono',      label: 'أبيض وأسود', nameEn: 'Mono',     params: { saturation: -1, contrast: 0.22, shadows: 0.15, whites: 0.15, blacks: -0.1, grain: 0.18 } },
  { id: 'hdr',       label: 'HDR',      nameEn: 'HDR Punch',  params: { highlights: -0.55, shadows: 0.5, clarity: 0.5, texture: 0.35, vibrance: 0.3, contrast: 0.1 } },
]

export function applyPreset(preset: PresetId): StudioParams {
  const descriptor = PRESETS.find((p) => p.id === preset)
  return clampParams({ ...DEFAULT_PARAMS, ...(descriptor?.params ?? {}) })
}
