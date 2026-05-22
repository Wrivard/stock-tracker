import { twelvedataBucket } from '../throttle'
import { getApiKey } from '../settings-keys'
import type {
  HistoricalCandle,
  HistoryPeriod,
  ProviderError,
  Quote,
} from '../types'

const BASE = 'https://api.twelvedata.com'

const PERIOD_TO_SIZE: Record<HistoryPeriod, number> = {
  '1M': 22,
  '3M': 66,
  '6M': 130,
  '1Y': 260,
  ALL: 5000,
}

function fail(
  code: ProviderError['code'],
  message: string,
  status?: number,
): ProviderError {
  const err = new Error(message) as ProviderError
  err.code = code
  err.provider = 'twelvedata'
  if (status !== undefined) err.status = status
  return err
}

function requireKey(): string {
  const key = getApiKey('twelvedata')
  if (!key) throw fail('unauthorized', 'Twelve Data API key missing — set it in Settings.')
  return key
}

// Twelve Data uses `:TSX` for Toronto and `:TSXV` for TSX Venture.
// Convert the user-facing `.TO` / `.V` suffixes we accept to the
// provider's format. Other suffixes are passed through unchanged.
function symbolForTwelveData(symbol: string): string {
  if (symbol.endsWith('.TO')) return `${symbol.slice(0, -3)}:TSX`
  if (symbol.endsWith('.V')) return `${symbol.slice(0, -2)}:TSXV`
  return symbol
}

interface TwelveDataTimeSeries {
  meta?: { symbol: string; interval: string; currency?: string; exchange?: string }
  values?: Array<{
    datetime: string
    open: string
    high: string
    low: string
    close: string
    volume: string
  }>
  status?: 'ok' | 'error'
  code?: number
  message?: string
}

interface TwelveDataQuoteResponse {
  symbol?: string
  name?: string
  exchange?: string
  currency?: string
  open?: string
  high?: string
  low?: string
  close?: string
  previous_close?: string
  change?: string
  percent_change?: string
  status?: 'ok' | 'error'
  code?: number
  message?: string
}

// Quote endpoint — used as a fallback / TSX route since Finnhub's free
// tier doesn't cover Toronto. Twelve Data returns all fields as strings
// which we coerce to numbers; missing fields default to 0.
export async function fetchQuote(symbol: string): Promise<Quote> {
  const key = requireKey()
  const td = symbolForTwelveData(symbol)
  await twelvedataBucket.take(1)
  const url = `${BASE}/quote?symbol=${encodeURIComponent(td)}&apikey=${key}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (res.status === 429) throw fail('rate_limit', 'Twelve Data rate limit hit', 429)
  if (!res.ok) throw fail('unknown', `Twelve Data HTTP ${res.status}`, res.status)
  const data = (await res.json()) as TwelveDataQuoteResponse
  if (data.status === 'error') {
    if (data.code === 429) throw fail('rate_limit', data.message ?? 'rate limited', 429)
    if (data.code === 404) throw fail('not_found', data.message ?? 'not found', 404)
    if (data.code === 401)
      throw fail('unauthorized', data.message ?? 'unauthorized', 401)
    throw fail('unknown', data.message ?? 'Twelve Data error', data.code)
  }
  const num = (v: string | undefined): number => {
    if (v === undefined || v === null || v === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  const close = num(data.close)
  const previousClose = num(data.previous_close)
  if (close === 0 && previousClose === 0) {
    throw fail('not_found', `Twelve Data returned empty quote for ${symbol}`, 404)
  }
  return {
    symbol,
    price: close,
    previousClose,
    change: num(data.change),
    changePercent: num(data.percent_change),
    dayHigh: num(data.high),
    dayLow: num(data.low),
    open: num(data.open),
    fetchedAt: Date.now(),
  }
}

// Surface which exchange suffix a symbol routes to, so the facade
// can pick the right provider without re-implementing the suffix
// rules.
export function routesViaTwelveData(symbol: string): boolean {
  return symbol.endsWith('.TO') || symbol.endsWith('.V')
}

export async function fetchDailyHistory(
  symbol: string,
  period: HistoryPeriod = '1Y',
): Promise<HistoricalCandle[]> {
  const key = requireKey()
  const td = symbolForTwelveData(symbol)
  const size = PERIOD_TO_SIZE[period]
  await twelvedataBucket.take(1)
  const url = `${BASE}/time_series?symbol=${encodeURIComponent(td)}&interval=1day&outputsize=${size}&apikey=${key}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (res.status === 429)
    throw fail('rate_limit', 'Twelve Data rate limit hit', 429)
  if (!res.ok) throw fail('unknown', `Twelve Data HTTP ${res.status}`, res.status)
  const data = (await res.json()) as TwelveDataTimeSeries
  if (data.status === 'error') {
    if (data.code === 429) throw fail('rate_limit', data.message ?? 'rate limited', 429)
    if (data.code === 404) throw fail('not_found', data.message ?? 'not found', 404)
    if (data.code === 401)
      throw fail('unauthorized', data.message ?? 'unauthorized', 401)
    throw fail('unknown', data.message ?? 'Twelve Data error', data.code)
  }
  if (!data.values) return []
  return data.values
    .map((v) => ({
      date: v.datetime,
      open: Number(v.open),
      high: Number(v.high),
      low: Number(v.low),
      close: Number(v.close),
      volume: Number(v.volume),
    }))
    .reverse()
}
