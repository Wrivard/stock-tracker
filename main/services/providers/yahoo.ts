import { yahooBucket } from '../throttle'
import type { Currency } from '../../db/types'
import type { ProviderError, Quote } from '../types'

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

// Yahoo's public chart endpoint requires a non-default User-Agent or
// the request returns 401. Standard browser UA does the job.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36'

function fail(
  code: ProviderError['code'],
  message: string,
  status?: number,
): ProviderError {
  const err = new Error(message) as ProviderError
  err.code = code
  err.provider = 'yahoo'
  if (status !== undefined) err.status = status
  return err
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string
        currency?: string
        exchangeName?: string
        instrumentType?: string
        regularMarketPrice?: number
        chartPreviousClose?: number
        regularMarketDayHigh?: number
        regularMarketDayLow?: number
      }
      indicators?: {
        quote?: Array<{
          open?: (number | null)[]
        }>
      }
    }>
    error?: { code?: string; description?: string } | null
  }
}

function mapType(t: string | undefined): Quote['quoteType'] {
  if (!t) return undefined
  const u = t.toUpperCase()
  if (u === 'EQUITY') return 'EQUITY'
  if (u === 'ETF') return 'ETF'
  if (u === 'INDEX') return 'INDEX'
  if (u === 'CRYPTOCURRENCY') return 'CRYPTOCURRENCY'
  return 'OTHER'
}

function mapCurrency(c: string | undefined): Currency | undefined {
  if (c === 'USD' || c === 'CAD') return c
  return undefined
}

// Fetches the latest quote. Returns the same Quote shape the rest of
// the app expects, plus optional metadata (quoteType, currency,
// exchange) the caller can use to upsert the ticker record.
export async function fetchQuote(symbol: string): Promise<Quote> {
  await yahooBucket.take(1)
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (res.status === 429) throw fail('rate_limit', 'Yahoo rate limit hit', 429)
  if (res.status === 401 || res.status === 403)
    throw fail('unauthorized', `Yahoo auth failed (${res.status})`, res.status)
  if (res.status === 404) throw fail('not_found', `Yahoo: unknown symbol ${symbol}`, 404)
  if (!res.ok) throw fail('unknown', `Yahoo HTTP ${res.status}`, res.status)
  const data = (await res.json()) as YahooChartResponse
  if (data.chart?.error) {
    throw fail(
      'not_found',
      data.chart.error.description ?? `Yahoo error for ${symbol}`,
      404,
    )
  }
  const result = data.chart?.result?.[0]
  const meta = result?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number') {
    throw fail('not_found', `Yahoo returned no price for ${symbol}`, 404)
  }
  const price = meta.regularMarketPrice
  const prev = meta.chartPreviousClose ?? price
  const change = price - prev
  const changePercent = prev > 0 ? (change / prev) * 100 : 0
  const openSeries = result?.indicators?.quote?.[0]?.open ?? []
  const firstOpen = openSeries.find((v): v is number => typeof v === 'number')
  return {
    symbol,
    price,
    previousClose: prev,
    change,
    changePercent,
    dayHigh: meta.regularMarketDayHigh ?? price,
    dayLow: meta.regularMarketDayLow ?? price,
    open: firstOpen ?? prev,
    fetchedAt: Date.now(),
    quoteType: mapType(meta.instrumentType),
    currency: mapCurrency(meta.currency),
    exchange: meta.exchangeName,
  }
}
