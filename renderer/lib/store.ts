import { create } from 'zustand'

import { api } from './api'
import type { Currency } from '../../main/db/types'

export type Locale = 'fr' | 'en'

interface UiState {
  displayCurrency: Currency
  locale: Locale
  refreshIntervalSec: number
  apiKeyStatus: { finnhub: boolean; twelvedata: boolean }
  initialized: boolean
  // Bump this whenever quotes are refreshed; pages subscribe and refetch.
  refreshTick: number
  lastRefreshAt: number | null
  loadFromBackend: () => Promise<void>
  setDisplayCurrency: (c: Currency) => Promise<void>
  setLocale: (l: Locale) => Promise<void>
  setRefreshIntervalSec: (s: number) => Promise<void>
  refreshApiKeyStatus: () => Promise<void>
  bumpRefresh: () => void
}

export const useUi = create<UiState>((set) => ({
  displayCurrency: 'CAD',
  locale: 'fr',
  refreshIntervalSec: 300,
  apiKeyStatus: { finnhub: false, twelvedata: false },
  initialized: false,
  refreshTick: 0,
  lastRefreshAt: null,

  loadFromBackend: async () => {
    const a = api()
    const [cur, loc, interval, keys] = await Promise.all([
      a.settings.get('app.displayCurrency'),
      a.settings.get('app.locale'),
      a.settings.get('app.refreshIntervalSec'),
      a.settings.apiKeyStatus(),
    ])
    set({
      displayCurrency: cur === 'USD' ? 'USD' : 'CAD',
      locale: loc === 'en' ? 'en' : 'fr',
      refreshIntervalSec: interval ? Number(interval) || 300 : 300,
      apiKeyStatus: keys,
      initialized: true,
    })
  },

  setDisplayCurrency: async (c) => {
    set({ displayCurrency: c })
    await api().settings.set('app.displayCurrency', c)
  },

  setLocale: async (l) => {
    set({ locale: l })
    await api().settings.set('app.locale', l)
  },

  setRefreshIntervalSec: async (s) => {
    set({ refreshIntervalSec: s })
    await api().settings.set('app.refreshIntervalSec', String(s))
  },

  refreshApiKeyStatus: async () => {
    const keys = await api().settings.apiKeyStatus()
    set({ apiKeyStatus: keys })
  },

  bumpRefresh: () =>
    set((s) => ({ refreshTick: s.refreshTick + 1, lastRefreshAt: Date.now() })),
}))

// Helper to read the current display currency synchronously inside callbacks.
export function currentDisplayCurrency(): Currency {
  return useUi.getState().displayCurrency
}
