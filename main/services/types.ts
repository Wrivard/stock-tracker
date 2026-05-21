import type { Currency } from '../db/types'

export interface Quote {
  symbol: string
  price: number
  change: number
  changePercent: number
  dayHigh: number
  dayLow: number
  previousClose: number
  open: number
  fetchedAt: number
  stale?: boolean
}

export interface Profile {
  symbol: string
  name: string | null
  exchange: string | null
  industry: string | null
  country: string | null
  currency: Currency
  logo: string | null
  webUrl: string | null
  marketCap: number | null
}

export interface NewsItem {
  id: string
  symbol: string
  headline: string
  summary: string
  source: string
  url: string
  publishedAt: number
  imageUrl: string | null
}

export interface HistoricalCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface FxRate {
  from: Currency
  to: Currency
  rate: number
  date: string
  fetchedAt: number
}

export interface SymbolSearchResult {
  symbol: string
  displaySymbol: string
  description: string
  type: string // e.g. "Common Stock", "ETP"
}

export interface CacheStatus {
  finnhubConfigured: boolean
  twelvedataConfigured: boolean
  // Last successful refresh per ticker (unix ms)
  quoteCacheAges: Record<string, number>
}

export type HistoryPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL'

export interface ProviderError extends Error {
  code: 'rate_limit' | 'unauthorized' | 'not_found' | 'network' | 'unknown'
  provider: string
  status?: number
}

export function isProviderError(err: unknown): err is ProviderError {
  return (
    err instanceof Error &&
    typeof (err as ProviderError).code === 'string' &&
    typeof (err as ProviderError).provider === 'string'
  )
}
