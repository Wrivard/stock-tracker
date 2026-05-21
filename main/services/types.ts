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
  // Optional security type when the provider reports it. Used to
  // auto-bucket ETFs into the dedicated sector instead of "other".
  quoteType?: 'EQUITY' | 'ETF' | 'INDEX' | 'CRYPTOCURRENCY' | 'OTHER'
  currency?: Currency
  exchange?: string
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
  // When this article actually came from one of an ETF's top holdings
  // (e.g. an Apple article surfaced for XEQT because XEQT holds AAPL),
  // we tag the parent ETF here so the UI can render "via XEQT" and the
  // News page filter can match either the direct symbol or the ETF
  // wrapper. Absent for plain ticker news.
  viaEtf?: string
}

export interface HistoricalCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Yahoo's `topHoldings` module: each ETF returns up to 10 holdings and
// an aggregated sector breakdown. The sector codes here are OUR internal
// codes (tech/health/…), already mapped from Yahoo's vocabulary.
export interface EtfHolding {
  symbol: string | null
  name: string
  percent: number // 0-1 (e.g. 0.2582 == 25.82%)
}

export interface EtfDetails {
  symbol: string
  family: string | null
  category: string | null
  // Sector weightings keyed by our sector code (tech/finance/…), values
  // in 0-1. Sum may be slightly less than 1 — Yahoo doesn't always
  // categorize everything (e.g. cash holdings).
  sectorWeightings: Record<string, number>
  holdings: EtfHolding[]
  fetchedAt: number
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
