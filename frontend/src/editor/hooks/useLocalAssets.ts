import { useCallback, useEffect, useState } from 'react'
import { localAssetsApi } from '@/lib/api'
import type { LocalAsset } from '@/types/api'

interface LocalAssetsState {
  assets: LocalAsset[]
  /** False when the folder is missing on the server. */
  enabled: boolean
  url: string
  total: number
  truncated: boolean
  detail?: string
  loading: boolean
  failed: boolean
}

const EMPTY: LocalAssetsState = {
  assets: [],
  enabled: false,
  url: '',
  total: 0,
  truncated: false,
  loading: true,
  failed: false,
}

/**
 * The premium stickers an admin put in `LOCAL_ASSETS_DIR`, for the asset library's **My assets** tab.
 * Loads once per mount; `reload` asks again after files are added.
 */
export function useLocalAssets() {
  const [state, setState] = useState<LocalAssetsState>(EMPTY)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    localAssetsApi.list(controller.signal).then(
      (page) =>
        setState({
          assets: page.assets,
          enabled: page.enabled,
          url: page.url,
          total: page.total,
          truncated: page.truncated,
          detail: page.detail,
          loading: false,
          failed: false,
        }),
      () => {
        if (!controller.signal.aborted) setState((current) => ({ ...current, loading: false, failed: true }))
      },
    )
    return () => controller.abort()
  }, [attempt])

  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, failed: false }))
    setAttempt((n) => n + 1)
  }, [])
  return { ...state, reload }
}
