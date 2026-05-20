import { useCallback, useEffect, useState } from 'react'

import type { Api } from '../../main/preload'

// Direct access to the IPC bridge exposed by the preload script.
// Throws when used outside Electron (e.g. during `next dev` in a plain
// browser tab — useful for early failure rather than silent undefined).
export function api(): Api {
  if (typeof window === 'undefined' || !window.api) {
    throw new Error(
      'IPC bridge unavailable: this page must run inside the Electron shell.',
    )
  }
  return window.api
}

// Quick helper hook to load data from an async fetcher on mount and on demand.
// Tracks loading / error / refetch state. Generic enough for any IPC call.
interface UseApiResourceResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useApiResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseApiResourceResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetcher())
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, error, refetch: load }
}
