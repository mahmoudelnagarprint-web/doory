import { describe, expect, test } from 'vitest'
import {
  OCR_UNAVAILABLE_CODE,
  OCR_UNAVAILABLE_MESSAGE,
  ocrUnavailableWarning,
  resolveOcrProvider,
} from './ocr'
import type { OcrProvider, TextLayerData } from './types'

/** Minimal real provider stub: no engine installed here either, but the shape must be exact. */
function stubProvider(overrides: Partial<OcrProvider> = {}): OcrProvider {
  return {
    id: 'stub-ocr',
    isAvailable: async () => true,
    recognise: async (): Promise<{ text: TextLayerData['content']; engine: string }> => ({
      text: '',
      engine: 'stub-ocr',
    }),
    ...overrides,
  }
}

describe('resolveOcrProvider', () => {
  test('returns null when nothing is supplied (no OCR engine is installed)', async () => {
    await expect(resolveOcrProvider()).resolves.toBeNull()
    await expect(resolveOcrProvider(undefined)).resolves.toBeNull()
  })

  test('returns a supplied provider as-is (same object identity)', async () => {
    const provider = stubProvider()
    const resolved = await resolveOcrProvider(provider)
    expect(resolved).not.toBeNull()
    expect(resolved).toBe(provider)
    expect(resolved?.id).toBe('stub-ocr')
  })

  test('does not probe availability: an unavailable provider is still handed back unchanged', async () => {
    let probed = false
    const provider = stubProvider({
      isAvailable: async () => {
        probed = true
        return false
      },
    })
    await expect(resolveOcrProvider(provider)).resolves.toBe(provider)
    expect(probed).toBe(false)
  })
})

describe('ocrUnavailableWarning', () => {
  test('carries the frozen code and the Arabic explanation', () => {
    const warning = ocrUnavailableWarning()
    expect(warning.code).toBe(OCR_UNAVAILABLE_CODE)
    expect(warning.code).toBe('ocr-unavailable')
    expect(warning.message).toBe(OCR_UNAVAILABLE_MESSAGE)
    expect(warning.message.length).toBeGreaterThan(0)
  })

  test('returns a fresh object on every call', () => {
    expect(ocrUnavailableWarning()).not.toBe(ocrUnavailableWarning())
  })
})
