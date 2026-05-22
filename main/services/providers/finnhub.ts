import { finnhubBucket } from '../throttle'
import { getApiKey } from '../settings-keys'
import type {
  NewsItem,
  ProviderError,
  Profile,
  Quote,
  SymbolSearchResult,
} from '../types'
import type { Currency } from '../../db/types'

const BASE = 'https://finnhub.io/api/v1'

function fail(
  code: ProviderError['code'],
  message: string,
  status?: number,
): ProviderError {
  const err = new Error(message) as ProviderError
  err.code = code
  err.provider = 'finnhub'
  if (status !== undefined) err.status = status
  return err
}

function requireKey(): string {
  const key = getApiKey('finnhub')
  if (!key) throw fail('unauthorized', 'Finnhub API key missing — set it in Settings.')
  return key
}

async function get<T>(pathQuery: string): Promise<T> {
  await finnhubBucket.take(1)
  const url = `${BASE}${pathQuery}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (res.status === 429) throw fail('rate_limit', 'Finnhub rate limit hit', 429)
  if (res.status === 401 || res.status === 403)
    throw fail('unauthorized', `Finnhub auth failed (${res.status})`, res.status)
  if (res.status === 404) throw fail('not_found', 'Finnhub not found', 404)
  if (!res.ok) throw fail('unknown', `Finnhub HTTP ${res.status}`, res.status)
  return (await res.json()) as T
}

interface FinnhubQuote {
  c: number  // current
  d: number  // change
  dp: number // change percent
  h: number  // day high
  l: number  // day low
  o: number  // open
  pc: number // previous close
  t: number  // unix seconds
}

export async function fetchQuote(symbol: string): Promise<Quote> {
  const key = requireKey()
  const data = await get<FinnhubQuote>(
    `/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`,
  )
  // Finnhub returns all zeros for unknown symbols on the free tier.
  if (!data || (data.c === 0 && data.pc === 0 && data.h === 0)) {
    throw fail('not_found', `Unknown or non-supported ticker on Finnhub: ${symbol}`, 404)
  }
  return {
    symbol,
    price: data.c,
    change: data.d ?? 0,
    changePercent: data.dp ?? 0,
    dayHigh: data.h,
    dayLow: data.l,
    open: data.o,
    previousClose: data.pc,
    fetchedAt: Date.now(),
  }
}

interface FinnhubProfile {
  country?: string
  currency?: string
  exchange?: string
  finnhubIndustry?: string
  logo?: string
  marketCapitalization?: number
  name?: string
  ticker?: string
  weburl?: string
}

export async function fetchProfile(symbol: string): Promise<Profile> {
  const key = requireKey()
  const data = await get<FinnhubProfile>(
    `/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`,
  )
  if (!data || !data.ticker) {
    throw fail('not_found', `No profile for ${symbol} on Finnhub`, 404)
  }
  const currency = (data.currency?.toUpperCase() as Currency) ?? 'USD'
  return {
    symbol,
    name: data.name ?? null,
    exchange: data.exchange ?? null,
    industry: data.finnhubIndustry ?? null,
    country: data.country ?? null,
    currency: currency === 'CAD' ? 'CAD' : 'USD',
    logo: data.logo ?? null,
    webUrl: data.weburl ?? null,
    marketCap:
      typeof data.marketCapitalization === 'number'
        ? data.marketCapitalization
        : null,
  }
}

interface FinnhubNews {
  category: string
  datetime: number
  headline: string
  id: number
  image: string
  related: string
  source: string
  summary: string
  url: string
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

interface FinnhubSearchResponse {
  count: number
  result: Array<{
    description: string
    displaySymbol: string
    symbol: string
    type: string
  }>
}

export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  const key = requireKey()
  const trimmed = query.trim()
  if (trimmed.length < 1) return []
  const data = await get<FinnhubSearchResponse>(
    `/search?q=${encodeURIComponent(trimmed)}&token=${key}`,
  )
  if (!data || !Array.isArray(data.result)) return []
  // Filter out garbage entries: Finnhub returns empty-displaySymbol results
  // for OTC / delisted in some cases. Cap to 15 for the dropdown.
  return data.result
    .filter((r) => r.symbol && r.displaySymbol)
    .slice(0, 15)
    .map((r) => ({
      symbol: r.symbol,
      displaySymbol: r.displaySymbol,
      description: r.description,
      type: r.type,
    }))
}

export async function fetchNews(symbol: string, days = 14): Promise<NewsItem[]> {
  const key = requireKey()
  const from = isoDaysAgo(days)
  const to = isoDaysAgo(0)
  const data = await get<FinnhubNews[]>(
    `/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${key}`,
  )
  if (!Array.isArray(data)) return []
  return data.slice(0, 50).map((n) => ({
    id: `${symbol}:${n.id}`,
    symbol,
    headline: n.headline,
    summary: n.summary,
    source: n.source,
    url: n.url,
    publishedAt: n.datetime * 1000,
    imageUrl: n.image || null,
  }))
}
