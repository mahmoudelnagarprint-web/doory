import type { LocalAssetsPage } from '@/types/api'
import { http } from './client'

/** The premium stickers the server lists from `LOCAL_ASSETS_DIR` (Assets → My assets). */
export const localAssetsApi = {
  list: (signal?: AbortSignal) => http.get<LocalAssetsPage>('/local-assets/', { signal }),
}
