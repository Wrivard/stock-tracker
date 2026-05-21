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
  // Bump this whenever a transaction is created/updated/deleted so all
  // pages that depend on positions refetch (Dashboard, Holdings, ticker
  // detail page, Rebalance).
  dataTick: number
  lastRefreshAt: number | null
  // Global Quick Trade dialog state — opened from anywhere via the header
  // button or Ctrl+N. Optionally pre-fills the ticker field.
  quickTradeOpen: boolean
  quickTradeDefaultTicker: string | null
  loadFromBackend: () => Promise<void>
  setDisplayCurrency: (c: Currency) => Promise<void>
  setLocale: (l: Locale) => Promise<void>
  setRefreshIntervalSec: (s: number) => Promise<void>
  refreshApiKeyStatus: () => Promise<void>
  bumpRefresh: () => void
  bumpData: () => void
  openQuickTrade: (defaultTicker?: string) => void
  closeQuickTrade: () => void
}

export const useUi = create<UiState>((set) => ({
  displayCurrency: 'CAD',
  locale: 'fr',
  refreshIntervalSec: 300,
  apiKeyStatus: { finnhub: false, twelvedata: false },
  initialized: false,
  refreshTick: 0,
  dataTick: 0,
  lastRefreshAt: null,
  quickTradeOpen: false,
  quickTradeDefaultTicker: null,

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

  bumpData: () => set((s) => ({ dataTick: s.dataTick + 1 })),

  openQuickTrade: (defaultTicker) =>
    set({ quickTradeOpen: true, quickTradeDefaultTicker: defaultTicker ?? null }),

  closeQuickTrade: () =>
    set({ quickTradeOpen: false, quickTradeDefaultTicker: null }),
}))

// Helper to read the current display currency synchronously inside callbacks.
export function currentDisplayCurrency(): Currency {
  return useUi.getState().displayCurrency
}
