import { create } from 'zustand'

import { api } from './api'
import type { Currency } from '../../main/db/types'

export type Locale = 'fr' | 'en'

interface UiState {
  displayCurrency: Currency
  locale: Locale
  refreshIntervalSec: number
  apiKeyStatus: {
    finnhub: boolean
    twelvedata: boolean
    openai: boolean
    finnhubTail: string | null
    twelvedataTail: string | null
    openaiTail: string | null
  }
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
  apiKeyStatus: {
    finnhub: false,
    twelvedata: false,
    openai: false,
    finnhubTail: null,
    twelvedataTail: null,
    openaiTail: null,
  },
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
    // Defensive: ignore garbage input. Without this, a stray
    // onValueChange firing with something other than USD/CAD would
    // poison the store and leave the Select trigger desynced from
    // its options (Radix renders the placeholder when value matches
    // no item, which then looks "stuck" on whatever was last valid).
    if (c !== 'USD' && c !== 'CAD') {
      console.warn('[store] ignoring invalid displayCurrency:', c)
      return
    }
    // Functional set form, so React's batched render sees the latest
    // state even if multiple setters fire in the same tick.
    set((s) => ({ ...s, displayCurrency: c }))
    try {
      await api().settings.set('app.displayCurrency', c)
    } catch (err) {
      console.error('[store] persisting displayCurrency failed:', err)
    }
  },

  setLocale: async (l) => {
    if (l !== 'fr' && l !== 'en') {
      console.warn('[store] ignoring invalid locale:', l)
      return
    }
    set((s) => ({ ...s, locale: l }))
    try {
      await api().settings.set('app.locale', l)
    } catch (err) {
      console.error('[store] persisting locale failed:', err)
    }
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
