import { invalidate, readRaw, withCache } from './cache'
import * as finnhub from './providers/finnhub'
import * as twelvedata from './providers/twelvedata'
import * as frankfurter from './providers/frankfurter'
import * as yahoo from './providers/yahoo'
import { industryToSectorCode } from './industry-sector'
import { listTickers as _listTickers, upsertTicker } from '../db/repo/tickers'
import type { Ticker } from '../db/types'
import { getSectorByCode } from '../db/repo/sectors'
import { getApiKey } from './settings-keys'
import type { Currency } from '../db/types'
import type {
  CacheStatus,
  EtfDetails,
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
  etfDetails: 24 * 3600_000, // 24 h — holdings turn over very slowly
}

// Quote routing strategy:
// 1) Yahoo Finance (public chart API): free, no key, covers US + TSX +
//    most global exchanges, and helpfully reports instrumentType so we
//    can auto-bucket ETFs. The default first try.
// 2) Finnhub: only useful for the user's configured key and US listings,
//    but we keep it as a fallback in case Yahoo's unofficial endpoint
//    rate-limits us or changes shape.
// 3) Twelve Data: paid tier covers everything but the free plan blocks
//    TSX, so it's a third-string fallback.
async function fetchQuoteWithFallback(symbol: string): Promise<Quote> {
  const errors: string[] = []
  try {
    return await yahoo.fetchQuote(symbol)
  } catch (err) {
    errors.push(`yahoo: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    return await finnhub.fetchQuote(symbol)
  } catch (err) {
    errors.push(`finnhub: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    return await twelvedata.fetchQuote(symbol)
  } catch (err) {
    errors.push(`twelvedata: ${err instanceof Error ? err.message : String(err)}`)
  }
  const combined = new Error(`Quote unavailable for ${symbol}: ${errors.join(' | ')}`)
  ;(combined as { code?: string }).code = 'not_found'
  ;(combined as { provider?: string }).provider = 'all'
  throw combined
}

export async function getQuote(symbol: string, opts?: { bypass?: boolean }) {
  const sym = symbol.toUpperCase()
  return withCache<Quote>(`quote:${sym}`, () => fetchQuoteWithFallback(sym), {
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

// News routing: Yahoo first (covers TSX + global), Finnhub as fallback
// for US tickers when Yahoo returns nothing.
async function fetchNewsWithFallback(symbol: string): Promise<NewsItem[]> {
  try {
    const yahooNews = await yahoo.fetchNews(symbol)
    if (yahooNews.length > 0) return yahooNews
  } catch {
    // fall through
  }
  try {
    return await finnhub.fetchNews(symbol)
  } catch {
    return []
  }
}

export async function getNews(symbol: string, opts?: { bypass?: boolean }) {
  const sym = symbol.toUpperCase()
  return withCache<NewsItem[]>(`news:${sym}`, () => fetchNewsWithFallback(sym), {
    ttlMs: TTL.news,
    staleFallback: true,
    bypass: opts?.bypass,
  })
}

// History routing: Yahoo first (free, covers TSX), Twelve Data as
// fallback for the rare case where Yahoo doesn't have the symbol or
// rate-limits us.
async function fetchHistoryWithFallback(
  symbol: string,
  period: HistoryPeriod,
): Promise<HistoricalCandle[]> {
  try {
    const candles = await yahoo.fetchDailyHistory(symbol, period)
    if (candles.length > 0) return candles
  } catch {
    // fall through to Twelve Data
  }
  return twelvedata.fetchDailyHistory(symbol, period)
}

export async function getHistory(symbol: string, period: HistoryPeriod = '1Y') {
  const sym = symbol.toUpperCase()
  return withCache<HistoricalCandle[]>(
    `history:${sym}:${period}`,
    () => fetchHistoryWithFallback(sym, period),
    { ttlMs: TTL.history, staleFallback: true },
  )
}

// ETF look-through data (sector weightings + top holdings). Cached
// 24 h since holdings barely change day-to-day. Cache miss returns
// the underlying error so callers can fall back to "100% ETF sector".
export async function getEtfDetails(symbol: string, opts?: { bypass?: boolean }) {
  const sym = symbol.toUpperCase()
  return withCache<EtfDetails | null>(
    `etfDetails:${sym}`,
    () => yahoo.fetchEtfDetails(sym),
    { ttlMs: TTL.etfDetails, staleFallback: true, bypass: opts?.bypass },
  )
}

export function getCachedEtfDetails(symbol: string) {
  return readRaw<EtfDetails | null>(`etfDetails:${symbol.toUpperCase()}`)
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
//
// We also use the Yahoo-reported `quoteType` ("ETF", "EQUITY", …) as a
// shortcut: when Finnhub's profile endpoint refuses to return industry
// data for a non-US listing, a quote that says "ETF" is still enough
// for us to bucket the position correctly.
export async function refreshTicker(symbol: string, opts?: { bypass?: boolean }) {
  const sym = symbol.toUpperCase()
  const quoteResult = await getQuote(sym, opts).catch((err) => ({
    error: err as Error,
  }))
  let profile: Profile | null = null
  let profileError: Error | null = null
  try {
    const p = await getProfile(sym, opts)
    profile = p.data
  } catch (err) {
    profileError = err as Error
  }

  const quoteData = 'error' in quoteResult ? null : quoteResult.data

  // Decide which sector to apply. Priority: explicit industry from a
  // Finnhub profile, then the Yahoo instrumentType (catches ETFs that
  // Finnhub doesn't list), then leave the existing sector alone.
  let sectorCode: string | null = null
  if (profile?.industry) {
    sectorCode = industryToSectorCode(profile.industry)
  } else if (quoteData?.quoteType === 'ETF') {
    sectorCode = 'etf'
  } else if (quoteData?.quoteType && quoteData.quoteType !== 'OTHER') {
    sectorCode = 'other'
  }

  const sectorId = sectorCode ? getSectorByCode(sectorCode)?.id ?? null : null

  // Pick the best metadata we can: profile wins, then quote.
  const inferredCurrency = profile?.currency ?? quoteData?.currency
  const inferredExchange = profile?.exchange ?? quoteData?.exchange ?? undefined
  const inferredName = profile?.name ?? undefined

  if (profile || quoteData) {
    upsertTicker({
      symbol: sym,
      name: inferredName,
      currency: inferredCurrency,
      exchange: inferredExchange,
      sectorId: sectorCode ? sectorId : undefined,
      // sectorOverride defaults to false; upsert only writes the
      // sector when the existing override flag is 0.
    })
  }

  // For ETFs, also pull the sector weightings + top holdings so the
  // portfolio overview can do look-through allocation. Cached for a
  // full day — the per-refresh cost is one Yahoo call per ETF per day.
  if (quoteData?.quoteType === 'ETF') {
    try {
      await getEtfDetails(sym, opts)
    } catch {
      // Look-through enrichment is best-effort.
    }
  }

  return {
    quote: 'error' in quoteResult ? null : quoteResult,
    quoteError: 'error' in quoteResult ? quoteResult.error.message : null,
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
