import { describe, expect, it } from 'vitest'
import {
  CONTROLS, CONTROL_ORDER, DEFAULT_PARAMS, PRESETS, applyPreset, clampParams, isDefaultParams,
  paramsEqual, restoreParams, serializeParams,
} from './params'

describe('control contract', () => {
  it('keeps every reset value inside its declared range with a positive step', () => {
    for (const control of Object.values(CONTROLS)) {
      expect(control.reset, `${control.key} reset in range`).toBeGreaterThanOrEqual(control.min)
      expect(control.reset, `${control.key} reset in range`).toBeLessThanOrEqual(control.max)
      expect(control.step, `${control.key} positive step`).toBeGreaterThan(0)
    }
  })

  it('covers every declared key exactly once', () => {
    expect(CONTROL_ORDER).toHaveLength(Object.keys(CONTROLS).length)
    expect(new Set(CONTROL_ORDER).size).toBe(CONTROL_ORDER.length)
  })

  it('defaults equal every control reset value', () => {
    for (const key of CONTROL_ORDER) expect(DEFAULT_PARAMS[key]).toBe(CONTROLS[key].reset)
    expect(isDefaultParams(DEFAULT_PARAMS)).toBe(true)
  })
})

describe('clampParams', () => {
  it('clamps out-of-range values into the declared domain', () => {
    const out = clampParams({ ...DEFAULT_PARAMS, exposure: 99, gamma: -5, grain: 7 })
    expect(out.exposure).toBe(2)
    expect(out.gamma).toBe(0.2)
    expect(out.grain).toBe(1)
  })

  it('replaces non-finite values with the control reset', () => {
    const out = clampParams({ ...DEFAULT_PARAMS, exposure: Number.NaN, contrast: Number.POSITIVE_INFINITY })
    expect(out.exposure).toBe(CONTROLS.exposure.reset)
    expect(out.contrast).toBe(CONTROLS.contrast.reset)
  })
})

describe('equality and snapshots', () => {
  it('compares every control', () => {
    expect(paramsEqual(DEFAULT_PARAMS, DEFAULT_PARAMS)).toBe(true)
    const one = clampParams({ ...DEFAULT_PARAMS, exposure: 0.25 })
    expect(paramsEqual(DEFAULT_PARAMS, one)).toBe(false)
  })

  it('serializes and restores without drift', () => {
    const changed = clampParams({ ...DEFAULT_PARAMS, temperature: -0.4, hue: 120 })
    const restored = restoreParams(serializeParams(changed))
    expect(paramsEqual(changed, restored)).toBe(true)
  })

  it('clips a corrupted snapshot back into the domain', () => {
    const values = Array.from({ length: CONTROL_ORDER.length }, () => 0)
    values[0] = 42 // exposure
    expect(restoreParams(JSON.stringify(values)).exposure).toBe(2)
  })
})

describe('presets', () => {
  it('neutral returns the untouched defaults', () => {
    expect(isDefaultParams(applyPreset('neutral'))).toBe(true)
  })

  it('named presets differ from the defaults and stay inside the domain', () => {
    for (const preset of PRESETS.filter((p) => p.id !== 'neutral')) {
      const applied = applyPreset(preset.id)
      expect(isDefaultParams(applied), preset.id).toBe(false)
      for (const key of CONTROL_ORDER) {
        const spec = CONTROLS[key]
        expect(applied[key], `${preset.id}:${key}`).toBeGreaterThanOrEqual(spec.min)
        expect(applied[key], `${preset.id}:${key}`).toBeLessThanOrEqual(spec.max)
      }
    }
  })

  it('mono desaturates fully', () => {
    expect(applyPreset('mono').saturation).toBe(-1)
  })
})
