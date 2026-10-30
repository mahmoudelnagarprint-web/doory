/**
 * Design Decomposer — OCR seam.
 *
 * The deconstructor can only turn raster text into a *live* editable text layer when a real OCR
 * engine is installed. This project ships none: there is no tesseract.js / paddleocr dependency
 * and no backend OCR endpoint (`package.json` is frozen, adding one is out of scope).
 *
 * Therefore this module is deliberately honest:
 *  - `resolveOcrProvider()` hands back a provider the caller injected, or `null`.
 *  - It never fabricates characters, never guesses a string from pixel statistics and never
 *    reports a confidence it did not measure.
 *  - When no provider exists, the pipeline keeps the candidate as an ordinary raster image layer
 *    and surfaces `OCR_UNAVAILABLE_WARNING` so the UI can tell the user why the text is not
 *    editable yet.
 */
import type { OcrProvider, PipelineWarning } from './types'

/* Types the studio UI needs when it renders a text candidate. Re-exported so UI modules never
 * have to reach into `types.ts` for them. */
export type { OcrProvider, TextLayerData } from './types'

/** Warning code emitted for every text candidate that could not be recognised. */
export const OCR_UNAVAILABLE_CODE = 'ocr-unavailable' as const

/** Arabic, user-facing explanation: shown verbatim, no invented text. */
export const OCR_UNAVAILABLE_MESSAGE =
  'لا يوجد محرك تعرّف ضوئي على الحروف (OCR) مثبّت في هذا الإصدار؛ سيُحتفظ بالنص كصورة داخل الطبقة.'

/** A fresh `ocr-unavailable` warning (a factory, so callers can never share a mutable object). */
export function ocrUnavailableWarning(): PipelineWarning {
  return { code: OCR_UNAVAILABLE_CODE, message: OCR_UNAVAILABLE_MESSAGE }
}

/**
 * Resolves the OCR engine to use for text candidates.
 *
 * Returns the caller's provider unchanged when one is supplied (so the UI can opt into a real
 * engine later), otherwise `null`. Availability is NOT probed with `isAvailable()` here on
 * purpose: this function must stay pure and side-effect free, and `recognise()` already throws
 * when an injected engine cannot actually run — the pipeline turns that into an honest warning.
 */
export async function resolveOcrProvider(preferred?: OcrProvider): Promise<OcrProvider | null> {
  return preferred ?? null
}
