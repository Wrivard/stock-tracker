import { useEffect } from 'react'

import { api } from './api'
import { useUi } from './store'

// Background poll that refreshes quotes for all holdings every N seconds.
// Disabled when N<=0 or when the Finnhub key isn't configured. Only one
// instance should mount at a time — we mount it in AppLayout.
export function useAutoRefresh() {
  const interval = useUi((s) => s.refreshIntervalSec)
  const bumpRefresh = useUi((s) => s.bumpRefresh)
  const finnhubOk = useUi((s) => s.apiKeyStatus.finnhub)
  const initialized = useUi((s) => s.initialized)

  useEffect(() => {
    if (!initialized) return
    if (interval <= 0) return
    if (!finnhubOk) return

    const id = setInterval(async () => {
      try {
        await api().market.refreshAll()
        bumpRefresh()
      } catch {
        // Errors here are non-fatal; the manual Refresh button surfaces
        // them with a toast when triggered explicitly.
      }
    }, interval * 1000)

    return () => clearInterval(id)
  }, [interval, finnhubOk, initialized, bumpRefresh])
}
