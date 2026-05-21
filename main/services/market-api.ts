import { invalidate, readRaw, withCache } from './cache'
import * as finnhub from './providers/finnhub'
import * as twelvedata from './providers/twelvedata'
import * as frankfurter from './providers/frankfurter'
import { industryToSectorCode } from './industry-sector'
import { listTickers as _listTickers, upsertTicker } from '../db/repo/tickers'
import type { Ticker } from '../db/types'
import { getSectorByCode } from '../db/repo/sectors'
import { getApiKey } from './settings-keys'
import type { Currency } from '../db/types'
import type {
  CacheStatus,
  FxRate,
  HistoricalCandle,
  HistoryPeriod,
  NewsItem,
  Profile,
  Quote,
  SymbolSearchResult,
} from './types'

const TTL = {
  quote: 60_000,        // 1 min — markets move fast
  profile: 24 * 3600_000, // 24 h — rarely changes
  news: 30 * 60_000,    // 30 min
  history: 6 * 3600_000,  // 6 h — daily candles update once/day
  fx: 6 * 3600_000,       // 6 h — daily ECB reference rate
  search: 60 * 60_000,  // 1 h — symbol universe doesn't change often
}

export async function getQuote(symbol: string, opts?: { bypass?: boolean }) {
  const sym = symbol.toUpperCase()
  return withCache<Quote>(`quote:${sym}`, () => finnhub.fetchQuote(sym), {
    ttlMs: TTL.quote,
    staleFallback: true,
    bypass: opts?.bypass,
  })
}

export async function getProfile(symbol: string, opts?: { bypass?: boolean }) {
  const sym = symbol.toUpperCase()
  return withCache<Profile>(`profile:${sym}`, () => finnhub.fetchProfile(sym), {
    ttlMs: TTL.profile,
    staleFallback: true,
    bypass: opts?.bypass,
  })
}

// Symbol search powers the ticker autocomplete in the New Transaction
// dialog. Cached for 1 h per normalized query so rapid typing replays
// against a warm cache instead of burning Finnhub tokens.
export async function searchTickers(query: string) {
  const q = query.trim().toUpperCase()
  if (q.length === 0) {
    return {
      data: [] as SymbolSearchResult[],
      fetchedAt: Date.now(),
      expiresAt: Date.now(),
      stale: false,
    }
  }
  return withCache<SymbolSearchResult[]>(
    `search:${q}`,
    () => finnhub.searchSymbols(q),
    { ttlMs: TTL.search, staleFallback: true },
  )
}

export async function getNews(symbol: string, opts?: { bypass?: boolean }) {
  const sym = symbol.toUpperCase()
  return withCache<NewsItem[]>(`news:${sym}`, () => finnhub.fetchNews(sym), {
    ttlMs: TTL.news,
    staleFallback: true,
    bypass: opts?.bypass,
  })
}

export async function getHistory(symbol: string, period: HistoryPeriod = '1Y') {
  const sym = symbol.toUpperCase()
  return withCache<HistoricalCandle[]>(
    `history:${sym}:${period}`,
    () => twelvedata.fetchDailyHistory(sym, period),
    { ttlMs: TTL.history, staleFallback: true },
  )
}

export async function getFxRate(from: Currency, to: Currency) {
  return withCache<FxRate>(
    `fx:${from}->${to}`,
    () => frankfurter.fetchFxRate(from, to),
    { ttlMs: TTL.fx, staleFallback: true },
  )
}

// Fetch quote + profile in one shot. Profile drives auto-sector assignment
// and updates the ticker's name / native currency if not overridden.
export async function refreshTicker(symbol: string, opts?: { bypass?: boolean }) {
  const sym = symbol.toUpperCase()
  const quote = await getQuote(sym, opts).catch((err) => ({ error: err as Error }))
  let profile: Profile | null = null
  let profileError: Error | null = null
  try {
    const p = await getProfile(sym, opts)
    profile = p.data
  } catch (err) {
    profileError = err as Error
  }

  // Auto-update the ticker name + auto-assign sector when profile is available
  // and the user hasn't overridden the sector manually.
  if (profile) {
    const sectorCode = industryToSectorCode(profile.industry)
    const sector = getSectorByCode(sectorCode)
    upsertTicker({
      symbol: sym,
      name: profile.name ?? undefined,
      currency: profile.currency,
      exchange: profile.exchange ?? undefined,
      sectorId: sector?.id ?? null,
      // sectorOverride defaults to false here; upsert only writes the
      // sector when the existing override flag is 0.
    })
  }

  return {
    quote: 'error' in quote ? null : quote,
    quoteError: 'error' in quote ? quote.error.message : null,
    profile,
    profileError: profileError?.message ?? null,
  }
}

export async function refreshAll(opts?: { bypass?: boolean }) {
  const tickers = _listTickers()
  const out: Record<string, Awaited<ReturnType<typeof refreshTicker>>> = {}
  for (const t of tickers) {
    out[t.symbol] = await refreshTicker(t.symbol, opts)
  }
  return out
}

export function getCachedQuote(symbol: string) {
  return readRaw<Quote>(`quote:${symbol.toUpperCase()}`)
}

export function getCachedProfile(symbol: string) {
  return readRaw<Profile>(`profile:${symbol.toUpperCase()}`)
}

export function getCacheStatus(): CacheStatus {
  const tickers = _listTickers()
  const ages: Record<string, number> = {}
  for (const t of tickers) {
    const c = readRaw<Quote>(`quote:${t.symbol}`)
    if (c) ages[t.symbol] = c.fetchedAt
  }
  return {
    finnhubConfigured: !!getApiKey('finnhub'),
    twelvedataConfigured: !!getApiKey('twelvedata'),
    quoteCacheAges: ages,
  }
}

export function invalidateAllQuotes(): void {
  invalidate('quote:')
}

export type AnnotatedNewsItem = NewsItem & {
  tickerName: string | null
  sectorCode: string | null
}

// Aggregate news from cached feeds for every owned ticker.
//
// With `cachedOnly: true` (the default) we only read what's already in
// `api_cache` — no HTTP, no throttle waits. The dashboard / ticker page
// can render instantly even with N tickers and a cold cache.
//
// With `cachedOnly: false` we go through `getNews` (withCache + fetcher),
// which fetches anything missing or expired. That call respects the
// Finnhub token bucket, so it can take ~N seconds for N missing tickers.
// Use it from the News page or a dedicated "Refresh news" action.
export async function getPortfolioNews(opts?: {
  cachedOnly?: boolean
}): Promise<{
  items: AnnotatedNewsItem[]
  errors: Record<string, string>
}> {
  const cachedOnly = opts?.cachedOnly ?? true
  const tickers: Ticker[] = _listTickers()
  const items: AnnotatedNewsItem[] = []
  const errors: Record<string, string> = {}
  for (const t of tickers) {
    try {
      if (cachedOnly) {
        const cached = readRaw<import('./types').NewsItem[]>(`news:${t.symbol}`)
        if (!cached) continue
        for (const n of cached.data) {
          items.push({ ...n, tickerName: t.name, sectorCode: null })
        }
      } else {
        const { data } = await getNews(t.symbol)
        for (const n of data) {
          items.push({ ...n, tickerName: t.name, sectorCode: null })
        }
      }
    } catch (err) {
      errors[t.symbol] = err instanceof Error ? err.message : String(err)
    }
  }
  items.sort((a, b) => b.publishedAt - a.publishedAt)
  return { items, errors }
}
