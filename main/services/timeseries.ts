import { listHoldings } from '../db/repo/holdings'
import { listTransactions } from '../db/repo/transactions'
import { getCachedQuote } from './market-api'
import { readRaw } from './cache'
import { getSetting } from '../db/repo/settings'
import { DEFAULTS, SETTING_KEYS } from './settings-keys'
import { PERIOD_DAYS, type PeriodKey } from './performance'
import type { Currency } from '../db/types'
import type { FxRate, HistoricalCandle } from './types'

// Wider key for the dashboard chart — supports "all" on top of the same
// fixed-day windows that drive the Performance card.
export type TimeSeriesPeriod = PeriodKey | 'all'

export interface PortfolioTimePoint {
  date: string
  value: number
}

export interface PortfolioTimeSeriesResult {
  period: TimeSeriesPeriod
  displayCurrency: Currency
  points: PortfolioTimePoint[]
  startValue: number
  endValue: number
  // % change from startValue → endValue. 0 when startValue is 0
  // (typical when the period is longer than the user's investment history).
  pnlPct: number
  // Tickers we couldn't include because no 1Y history was cached. The
  // returned series excludes their contribution entirely (rather than
  // pretending they're worth $0 and tanking the line), so we surface
  // the list to the UI for a "X tickers excluded" hint.
  missingTickers: string[]
}

function readDisplayCurrency(): Currency {
  const raw = getSetting(SETTING_KEYS.displayCurrency)
  return raw === 'USD' ? 'USD' : (DEFAULTS.displayCurrency as Currency)
}

// Find the close of the candle on or before `targetMs`. Falls back to the
// earliest candle if target predates all of them. Returns null only when
// the history is empty.
function closeAtOrBefore(
  history: HistoricalCandle[],
  targetMs: number,
): number | null {
  if (history.length === 0) return null
  let chosen: HistoricalCandle | null = null
  for (const c of history) {
    const t = new Date(c.date + 'T00:00:00Z').getTime()
    if (t > targetMs) break
    chosen = c
  }
  return (chosen ?? history[0]).close
}

// Walk the txs ledger forward and return the quantity held as of cutoffMs.
// Same skeleton as performance.positionAtDate but only returns quantity
// (we don't need cost basis for value timeseries).
function quantityAtDate(ticker: string, cutoffMs: number): number {
  const txs = listTransactions({ ticker })
  const ordered = [...txs].reverse()
  let qty = 0
  for (const t of ordered) {
    const txMs = new Date(t.occurredAt + 'T00:00:00Z').getTime()
    if (txMs > cutoffMs) break
    if (t.kind === 'buy') qty += t.quantity
    else qty -= t.quantity
  }
  return qty
}

// Build a daily value series from `startMs` to today by walking the
// calendar one day at a time. For each day, sum (qty_on_day * price_on_day)
// over every owned ticker, converted to display currency with the current
// FX rate. Using *current* FX (instead of per-day historical rate) is a
// pragmatic shortcut: we don't cache historical FX, and for a personal
// dashboard the distortion is negligible vs the price moves.
export function computePortfolioTimeSeries(
  period: TimeSeriesPeriod,
  displayCurrency?: Currency,
): PortfolioTimeSeriesResult {
  const display = displayCurrency ?? readDisplayCurrency()
  const todayMs = Date.now()

  // For "all", anchor the start at the user's earliest transaction (the
  // first day there was anything to value). Falls back to a year if
  // there are no transactions yet — keeps the chart bounded.
  let startMs: number
  if (period === 'all') {
    const txs = listTransactions()
    if (txs.length > 0) {
      // listTransactions returns DESC; the last item is the earliest.
      const earliest = txs[txs.length - 1].occurredAt
      startMs = new Date(earliest + 'T00:00:00Z').getTime()
    } else {
      startMs = todayMs - 365 * 86_400_000
    }
  } else {
    startMs = todayMs - PERIOD_DAYS[period] * 86_400_000
  }

  const fxCache = readRaw<FxRate>('fx:USD->CAD')
  const usdToCad = fxCache?.data.rate ?? 1
  function toDisplay(value: number, native: Currency): number {
    if (native === display) return value
    if (native === 'USD' && display === 'CAD') return value * usdToCad
    if (native === 'CAD' && display === 'USD') return value / usdToCad
    return value
  }

  const holdings = listHoldings()
  // Preload each holding's history once instead of re-reading the cache
  // row 365 times per ticker.
  const histories = new Map<string, HistoricalCandle[]>()
  const missingTickers: string[] = []
  for (const h of holdings) {
    const cache = readRaw<HistoricalCandle[]>(`history:${h.ticker}:1Y`)
    if (cache?.data && cache.data.length > 0) {
      histories.set(h.ticker, cache.data)
    } else {
      missingTickers.push(h.ticker)
    }
  }

  // Walk by day so weekends/holidays render as flat segments, which is
  // what users intuitively expect. 1J degenerates to ~2 points
  // (yesterday's close, today's live value) — we leave it like that
  // rather than pretending to be intraday, since we don't cache minute
  // bars.
  const points: PortfolioTimePoint[] = []

  // Inclusive endpoints: start, start+1, …, today.
  const totalDays = Math.max(1, Math.floor((todayMs - startMs) / 86_400_000))
  for (let i = 0; i <= totalDays; i++) {
    const dayMs = startMs + i * 86_400_000
    let value = 0
    for (const h of holdings) {
      const hist = histories.get(h.ticker)
      if (!hist) continue
      const qty = quantityAtDate(h.ticker, dayMs)
      if (qty <= 0) continue
      const px = closeAtOrBefore(hist, dayMs)
      if (px === null) continue
      value += toDisplay(qty * px, h.currency)
    }
    const date = new Date(dayMs).toISOString().slice(0, 10)
    points.push({ date, value })
  }

  // Replace the very last point with TODAY's value using current quotes
  // instead of yesterday's close. Otherwise the chart trails the live
  // KPIs by up to a day, which looks broken right after a refresh.
  // IMPORTANT: only include tickers that also contributed to the
  // historical walk (i.e. have a history cache). Otherwise the chart
  // jumps at the last point because a no-history ticker suddenly appears
  // in the total, inconsistent with the rest of the series.
  let liveTotal = 0
  for (const h of holdings) {
    if (!histories.has(h.ticker)) continue
    const cachedQ = getCachedQuote(h.ticker)
    const price = cachedQ?.data.price ?? null
    if (price === null) continue
    const qty = quantityAtDate(h.ticker, todayMs)
    if (qty <= 0) continue
    liveTotal += toDisplay(qty * price, h.currency)
  }
  if (points.length > 0 && liveTotal > 0) {
    points[points.length - 1] = {
      date: new Date(todayMs).toISOString().slice(0, 10),
      value: liveTotal,
    }
  }

  const startValue = points[0]?.value ?? 0
  const endValue = points[points.length - 1]?.value ?? 0
  const pnlPct = startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0

  return {
    period,
    displayCurrency: display,
    points,
    startValue,
    endValue,
    pnlPct,
    missingTickers,
  }
}
