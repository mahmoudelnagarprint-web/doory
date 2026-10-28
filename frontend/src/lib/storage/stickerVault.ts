/**
 * Persistent custom sticker vault.
 *
 * Custom AI-cutout stickers live in a dedicated IndexedDB database
 * (`nagar_sticker_vault_db`). Each sticker is a PNG data URL with an alpha
 * channel, a display name, a category and optional tags. The vault is fully
 * lazy-loaded by the Stickers tab, so it never contributes to the editor's
 * initial bundle.
 *
 * The schema follows the shape the task specifies:
 *   { id, name, category, tags, dataUrl, width, height, createdAt }
 *
 * A small in-memory fallback is used when IndexedDB is unavailable (private
 * mode, blocked storage), mirroring the repo's `src/lib/local/store.ts`.
 */

import { uuid } from '@/lib/uuid'

export type StickerCategory = string

export interface StickerRecord {
  id: string
  name: string
  category: StickerCategory
  tags: string[]
  /** PNG data URL with an alpha channel. */
  dataUrl: string
  width: number
  height: number
  createdAt: number
}

/** The serialisable shape used for `.json` backup / import. */
export interface StickerVaultExport {
  version: 1
  exportedAt: number
  stickers: StickerRecord[]
}

/** Maps low-level IndexedDB failures onto a stable, tellable error. */
export class VaultError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'VaultError'
  }
}

export const VAULT_DB_NAME = 'nagar_sticker_vault_db'
export const VAULT_DB_VERSION = 1
const STICKERS = 'stickers'

interface VaultBackend {
  list(): Promise<StickerRecord[]>
  get(id: string): Promise<StickerRecord | undefined>
  put(record: StickerRecord): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'))
  })
}

function open(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let opening: IDBOpenDBRequest
    try {
      opening = factory.open(VAULT_DB_NAME, VAULT_DB_VERSION)
    } catch (error) {
      reject(new VaultError('IndexedDB could not be opened', error))
      return
    }
    opening.onupgradeneeded = () => {
      const db = opening.result
      if (!db.objectStoreNames.contains(STICKERS)) {
        const store = db.createObjectStore(STICKERS, { keyPath: 'id' })
        store.createIndex('category', 'category', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    opening.onsuccess = () => resolve(opening.result)
    opening.onerror = () => reject(new VaultError('IndexedDB could not be opened', opening.error))
    opening.onblocked = () => reject(new VaultError('IndexedDB is blocked', undefined))
  })
}

function createIndexedDbBackend(db: IDBDatabase): VaultBackend {
  db.onversionchange = () => db.close()

  return {
    async list() {
      try {
        return await request<StickerRecord[]>(db.transaction(STICKERS, 'readonly').objectStore(STICKERS).getAll())
      } catch (error) {
        throw new VaultError('Could not list stickers', error)
      }
    },
    async get(id: string) {
      try {
        return await request<StickerRecord | undefined>(db.transaction(STICKERS, 'readonly').objectStore(STICKERS).get(id))
      } catch (error) {
        throw new VaultError('Could not read the sticker', error)
      }
    },
    async put(record: StickerRecord) {
      try {
        const tx = db.transaction(STICKERS, 'readwrite')
        tx.objectStore(STICKERS).put(record)
        await transactionDone(tx)
      } catch (error) {
        throw new VaultError('Could not save the sticker', error)
      }
    },
    async remove(id: string) {
      try {
        const tx = db.transaction(STICKERS, 'readwrite')
        tx.objectStore(STICKERS).delete(id)
        await transactionDone(tx)
      } catch (error) {
        throw new VaultError('Could not delete the sticker', error)
      }
    },
    async clear() {
      try {
        const tx = db.transaction(STICKERS, 'readwrite')
        tx.objectStore(STICKERS).clear()
        await transactionDone(tx)
      } catch (error) {
        throw new VaultError('Could not clear the vault', error)
      }
    },
  }
}

function createMemoryBackend(): VaultBackend {
  const records = new Map<string, StickerRecord>()
  return {
    list: async () => [...records.values()],
    get: async (id) => records.get(id),
    put: async (record) => {
      records.set(record.id, record)
    },
    remove: async (id) => {
      records.delete(id)
    },
    clear: async () => {
      records.clear()
    },
  }
}

let backendPromise: Promise<VaultBackend> | null = null

function getBackend(): Promise<VaultBackend> {
  if (backendPromise) return backendPromise
  if (typeof indexedDB === 'undefined') {
    backendPromise = Promise.resolve(createMemoryBackend())
    return backendPromise
  }
  backendPromise = open()
    .then(createIndexedDbBackend)
    .catch(() => createMemoryBackend())
  return backendPromise
}

function makeId(): string {
  return uuid()
}

export interface NewStickerInput {
  name: string
  category?: StickerCategory
  tags?: string[]
  dataUrl: string
  width: number
  height: number
}

/** Adds a sticker to the vault and returns its full record. */
export async function addSticker(input: NewStickerInput): Promise<StickerRecord> {
  const record: StickerRecord = {
    id: makeId(),
    name: input.name.trim() || 'Unnamed sticker',
    category: input.category?.trim() || 'عام',
    tags: input.tags?.slice() ?? [],
    dataUrl: input.dataUrl,
    width: input.width,
    height: input.height,
    createdAt: Date.now(),
  }
  const backend = await getBackend()
  await backend.put(record)
  return record
}

/** Lists every sticker in the vault. */
export async function listStickers(): Promise<StickerRecord[]> {
  const backend = await getBackend()
  return backend.list()
}

/** Renames / re-categorises / re-tags an existing sticker. */
export async function updateSticker(
  id: string,
  patch: Partial<Pick<StickerRecord, 'name' | 'category' | 'tags'>>,
): Promise<StickerRecord | undefined> {
  const backend = await getBackend()
  const existing = await backend.get(id)
  if (!existing) return undefined
  const next: StickerRecord = {
    ...existing,
    name: patch.name !== undefined ? (patch.name.trim() || existing.name) : existing.name,
    category: patch.category !== undefined ? (patch.category.trim() || existing.category) : existing.category,
    tags: patch.tags !== undefined ? patch.tags.slice() : existing.tags,
  }
  await backend.put(next)
  return next
}

/** Deletes one sticker from the vault. */
export async function deleteSticker(id: string): Promise<void> {
  const backend = await getBackend()
  await backend.remove(id)
}

/** Returns the distinct categories currently in use, sorted by usage. */
export async function listCategories(): Promise<StickerCategory[]> {
  const records = await listStickers()
  const counts = new Map<StickerCategory, number>()
  for (const r of records) counts.set(r.category, (counts.get(r.category) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([cat]) => cat)
}

/** Serialises the whole vault into an exchangeable `.json` structure. */
export async function exportVault(): Promise<StickerVaultExport> {
  const stickers = await listStickers()
  return { version: 1, exportedAt: Date.now(), stickers }
}

function isRecord(value: unknown): value is StickerRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.category === 'string' &&
    Array.isArray(r.tags) &&
    r.tags.every((tag) => typeof tag === 'string') &&
    typeof r.dataUrl === 'string' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number' &&
    typeof r.createdAt === 'number'
  )
}

/** Merges a previously exported `.json` vault back in (idempotent: an id already present is updated). */
export async function importVault(exported: StickerVaultExport): Promise<number> {
  if (typeof exported !== 'object' || exported === null || exported.version !== 1 || !Array.isArray(exported.stickers)) {
    throw new VaultError('Unsupported vault file', undefined)
  }
  const backend = await getBackend()
  let imported = 0
  for (const raw of exported.stickers) {
    if (!isRecord(raw)) continue
    await backend.put(raw)
    imported += 1
  }
  return imported
}

/** Wipes the whole vault. */
export async function clearVault(): Promise<void> {
  const backend = await getBackend()
  await backend.clear()
}
