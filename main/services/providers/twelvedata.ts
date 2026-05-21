import { twelvedataBucket } from '../throttle'
import { getApiKey } from '../settings-keys'
import type { HistoricalCandle, HistoryPeriod, ProviderError } from '../types'

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

export async function fetchDailyHistory(
  symbol: string,
  period: HistoryPeriod = '1Y',
): Promise<HistoricalCandle[]> {
  const key = requireKey()
  const td = symbolForTwelveData(symbol)
  const size = PERIOD_TO_SIZE[period]
  await twelvedataBucket.take(1)
  const url = `${BASE}/time_series?symbol=${encodeURIComponent(td)}&interval=1day&outputsize=${size}&apikey=${key}`
  const res = await fetch(url)
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
