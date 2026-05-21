import YahooFinance from 'yahoo-finance2'

import { yahooBucket } from '../throttle'
import type { Currency } from '../../db/types'
import type {
  EtfDetails,
  EtfHolding,
  HistoricalCandle,
  HistoryPeriod,
  NewsItem,
  ProviderError,
  Quote,
} from '../types'

// Single shared client. yahoo-finance2 handles the crumb + cookie dance
// (required for /v10/quoteSummary) internally and caches them across
// calls. The survey notice is muted so it doesn't spam the log on every
// boot.
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

// Yahoo categorizes equity sectors differently from us (GICS-ish). Map
// their slugs onto our internal codes; multiple Yahoo buckets can fold
// into one of ours (consumer_cyclical + consumer_defensive → consumer).
const SECTOR_MAP: Record<string, string> = {
  technology: 'tech',
  healthcare: 'health',
  financial_services: 'finance',
  energy: 'energy',
  consumer_cyclical: 'consumer',
  consumer_defensive: 'consumer',
  industrials: 'industrial',
  basic_materials: 'materials',
  utilities: 'utilities',
  communication_services: 'telecom',
  realestate: 'real_estate',
}

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

function mapCurrency(c: string | undefined): Currency | undefined {
  if (c === 'USD' || c === 'CAD') return c
  return undefined
}

// Maps Yahoo's instrumentType to our internal Quote union — used by
// fetchQuote below and also by the chart-endpoint history path.
function mapTypeForQuote(t: string | undefined): Quote['quoteType'] {
  if (!t) return undefined
  const u = t.toUpperCase()
  if (u === 'EQUITY') return 'EQUITY'
  if (u === 'ETF') return 'ETF'
  if (u === 'INDEX') return 'INDEX'
  if (u === 'CRYPTOCURRENCY') return 'CRYPTOCURRENCY'
  return 'OTHER'
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
    quoteType: mapTypeForQuote(meta.instrumentType),
    currency: mapCurrency(meta.currency),
    exchange: meta.exchangeName,
  }
}

// Yahoo's `range` values for the chart endpoint match these.
const PERIOD_TO_RANGE: Record<HistoryPeriod, string> = {
  '1M': '1mo',
  '3M': '3mo',
  '6M': '6mo',
  '1Y': '1y',
  ALL: 'max',
}

interface YahooHistoryResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: (number | null)[]
          high?: (number | null)[]
          low?: (number | null)[]
          close?: (number | null)[]
          volume?: (number | null)[]
        }>
      }
    }>
    error?: { code?: string; description?: string } | null
  }
}

// Daily history via the same chart endpoint we use for quotes — same
// auth profile (no crumb needed), same throttle. Period maps onto
// Yahoo's `range` parameter; we always request `interval=1d` so the
// candle granularity matches the rest of the app.
export async function fetchDailyHistory(
  symbol: string,
  period: HistoryPeriod,
): Promise<HistoricalCandle[]> {
  await yahooBucket.take(1)
  const range = PERIOD_TO_RANGE[period]
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (res.status === 429) throw fail('rate_limit', 'Yahoo rate limit hit', 429)
  if (res.status === 401 || res.status === 403)
    throw fail('unauthorized', `Yahoo auth failed (${res.status})`, res.status)
  if (res.status === 404)
    throw fail('not_found', `Yahoo: unknown symbol ${symbol}`, 404)
  if (!res.ok) throw fail('unknown', `Yahoo HTTP ${res.status}`, res.status)
  const data = (await res.json()) as YahooHistoryResponse
  if (data.chart?.error) {
    throw fail(
      'not_found',
      data.chart.error.description ?? `Yahoo error for ${symbol}`,
      404,
    )
  }
  const result = data.chart?.result?.[0]
  const ts = result?.timestamp ?? []
  const quote = result?.indicators?.quote?.[0]
  if (!ts.length || !quote) return []
  const candles: HistoricalCandle[] = []
  for (let i = 0; i < ts.length; i++) {
    const close = quote.close?.[i]
    if (close === null || close === undefined) continue
    const date = new Date(ts[i] * 1000).toISOString().slice(0, 10)
    candles.push({
      date,
      open: quote.open?.[i] ?? close,
      high: quote.high?.[i] ?? close,
      low: quote.low?.[i] ?? close,
      close,
      volume: quote.volume?.[i] ?? 0,
    })
  }
  return candles
}

// News headlines via the search endpoint. yahoo-finance2's `search`
// returns both quote matches and recent press for the symbol; we ask
// for only news (quotesCount: 0) and map onto our NewsItem shape.
// Summary is left blank because Yahoo's search response doesn't carry
// article bodies — only the headline + link is reliable.
export async function fetchNews(symbol: string, count = 10): Promise<NewsItem[]> {
  await yahooBucket.take(1)
  try {
    const r = await yf.search(symbol, { newsCount: count, quotesCount: 0 })
    const items = r.news ?? []
    return items
      .filter((n) => n.title && n.link)
      .map((n) => ({
        id: `${symbol}:yahoo:${n.uuid ?? n.link}`,
        symbol,
        headline: n.title ?? '',
        summary: '',
        source: n.publisher ?? 'Yahoo',
        url: n.link ?? '',
        publishedAt: n.providerPublishTime
          ? new Date(n.providerPublishTime).getTime()
          : 0,
        imageUrl: n.thumbnail?.resolutions?.[0]?.url ?? null,
      }))
  } catch (err) {
    throw fail(
      'unknown',
      `Yahoo news lookup: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ETF holdings + sector weightings via Yahoo's quoteSummary endpoint
// (authenticated path, hence the yahoo-finance2 client). Returns null
// when the symbol isn't an ETF or Yahoo simply doesn't expose holdings
// for it (some smaller funds). Caller treats null as "details
// unavailable" rather than as an error.
export async function fetchEtfDetails(symbol: string): Promise<EtfDetails | null> {
  await yahooBucket.take(1)
  try {
    const r = await yf.quoteSummary(symbol, {
      modules: ['topHoldings', 'fundProfile'],
    })
    const th = r.topHoldings
    const fp = r.fundProfile
    if (!th) return null

    // sectorWeightings is an array of single-key objects like
    // [{technology: 0.21}, {financial_services: 0.20}, …]
    const sectorWeightings: Record<string, number> = {}
    for (const sw of th.sectorWeightings ?? []) {
      for (const [yahooKey, value] of Object.entries(sw)) {
        const internal = SECTOR_MAP[yahooKey] ?? 'other'
        const v = typeof value === 'number' ? value : 0
        sectorWeightings[internal] = (sectorWeightings[internal] ?? 0) + v
      }
    }

    const holdings: EtfHolding[] = (th.holdings ?? []).map((h) => ({
      symbol: h.symbol ?? null,
      name: h.holdingName ?? '',
      percent:
        typeof h.holdingPercent === 'number'
          ? h.holdingPercent
          : 0,
    }))

    return {
      symbol,
      family: fp?.family ?? null,
      category: fp?.categoryName ?? null,
      sectorWeightings,
      holdings,
      fetchedAt: Date.now(),
    }
  } catch (err) {
    // quoteSummary throws when the symbol has no fund profile (e.g.
    // a regular stock) — treat that as "not an ETF" and return null
    // so the caller can skip the look-through.
    const msg = err instanceof Error ? err.message : String(err)
    if (/no \w+ for/i.test(msg) || /not found/i.test(msg)) return null
    throw fail('unknown', `Yahoo ETF lookup: ${msg}`)
  }
}
