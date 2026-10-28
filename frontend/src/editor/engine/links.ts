/**
 * Link targets of objects. Kept out of `api/style.ts` because the static renderer needs it too, and
 * importing it from there would drag the whole style API into the renderer's chunk.
 */

/** The normalised URL when `raw` is an absolute http(s) address, otherwise null. */
export function safeLinkUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
