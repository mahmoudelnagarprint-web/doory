/**
 * Recursive scan behind `GET /api/local-assets`. Kept free of Express so it can be tested (and reused)
 * without installing dependencies.
 *
 * Mirrors the Django view in `backend/apps/assets/local_assets.py`: same extensions, same JSON fields,
 * same URL escaping and the same `maxFiles` cap.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const SUFFIXES = new Map([
  ['.svg', 'svg'],
  ['.png', 'image'],
  ['.jpg', 'image'],
  ['.jpeg', 'image'],
  ['.webp', 'image'],
  ['.gif', 'image'],
])

/** Folders that never hold design assets. */
export const SKIPPED_DIRS = new Set(['__pycache__', 'node_modules', '.git'])

const NAME_SPLIT = /[-_\s]+/

export function normalisePrefix(value) {
  const raw = String(value || '/assets/premium_stickers/').trim()
  const rooted = raw.startsWith('/') || /^https?:\/\//i.test(raw) ? raw : `/${raw}`
  return `${rooted.replace(/\/+$/, '')}/`
}

export function label(stem) {
  const words = stem.split(NAME_SPLIT).filter(Boolean)
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || stem
}

/** `badges/a b#1.svg` → `badges/a%20b%231.svg` (each segment escaped, slashes kept). */
export function encodePath(relative) {
  return relative.split('/').map(encodeURIComponent).join('/')
}

/**
 * Every supported file under `root`, depth first.
 * @returns {Promise<{assets: Array<{name: string, path: string, url: string, type: 'svg'|'image', size: number}>, truncated: boolean}>}
 */
export async function scanFolder(root, { urlPrefix = '/assets/premium_stickers/', maxFiles = 2000 } = {}) {
  const base = await fs.realpath(root)
  const prefix = normalisePrefix(urlPrefix)
  const limit = Math.max(1, Number(maxFiles) || 2000)
  const assets = []
  let truncated = false

  async function walk(directory) {
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (truncated) return
      if (entry.name.startsWith('.')) continue
      const full = path.join(directory, entry.name)
      // Symlinks could point outside the folder; the Django view skips them too.
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) await walk(full)
        continue
      }
      if (!entry.isFile()) continue
      const kind = SUFFIXES.get(path.extname(entry.name).toLowerCase())
      if (!kind) continue
      if (assets.length >= limit) {
        truncated = true
        return
      }
      let stat
      try {
        stat = await fs.stat(full)
      } catch {
        continue
      }
      const relative = path.relative(base, full).split(path.sep).join('/')
      assets.push({
        name: label(path.basename(entry.name, path.extname(entry.name))),
        path: relative,
        url: `${prefix}${encodePath(relative)}`,
        type: kind,
        size: stat.size,
      })
    }
  }

  await walk(base)
  return { assets, truncated }
}
