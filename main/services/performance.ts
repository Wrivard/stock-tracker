import { listTransactions } from '../db/repo/transactions'
import { readRaw } from './cache'
import type { HistoricalCandle } from './types'

// Compute a single position's "real P&L" over a fixed look-back window.
//
// Naive holding-period return (price_now / price_start - 1) breaks as soon
// as the user trades during the period, because the cash flowing in or out
// inflates/deflates the apparent change. The classic correction is to
// subtract the net amount of cash invested during the window:
//
//   periodPnl   = value_now - value_start - net_cash_invested
//   periodPnlPct = periodPnl / max(value_start, |net_cash_invested|) * 100
//
// where net_cash_invested = sum(buy_amount) - sum(sell_proceeds) for trades
// inside the window. Positions opened during the window have value_start=0
// and the formula collapses to the standard avg-cost return, so we never
// need a separate code path for that case.

export interface PeriodPerformance {
  // Difference in unrealized + realized P&L between start and end of the
  // window, expressed in the native ticker currency.
  periodPnl: number
  // Percent return for the period. Normalized against value_start when the
  // position pre-existed, otherwise against the cash deployed during the
  // window (so a fresh buy that doubled shows ~+100% on its inception day).
  periodPnlPct: number
  // The reference price we used as the period start, exposed for the UI's
  // tooltip / debugging. null when no candle is close enough to start.
  startPrice: number | null
  // Did the position exist at start_of_period? false ⇒ opened during it.
  existedAtStart: boolean
}

// Walk transactions in chronological order and return what the position
// looked like as of `cutoffMs` (inclusive). We don't store snapshots per
// ticker — the txs ledger is the source of truth.
function positionAtDate(
  ticker: string,
  cutoffMs: number,
): { quantity: number; costBasis: number } {
  const txs = listTransactions({ ticker })
  // listTransactions returns DESC by occurred_at; reverse to walk forward.
  const ordered = [...txs].reverse()
  let qty = 0
  let cost = 0
  for (const t of ordered) {
    const txMs = new Date(t.occurredAt + 'T00:00:00Z').getTime()
    if (txMs > cutoffMs) break
    if (t.kind === 'buy') {
      cost += t.quantity * t.price + (t.fees ?? 0)
      qty += t.quantity
    } else {
      // Sell: reduce quantity and pro-rate the cost basis. Realized P&L is
      // baked into the period_pnl elsewhere via cash flow accounting.
      if (qty > 0) {
        const avg = cost / qty
        cost -= t.quantity * avg
        qty -= t.quantity
      }
    }
  }
  return { quantity: qty, costBasis: Math.max(cost, 0) }
}

// Net cash that left the brokerage account TO the ticker between (start, now].
// Positive = net buyer; negative = net seller (cash came back to the account).
function netCashInvested(ticker: string, startMs: number): number {
  const txs = listTransactions({ ticker })
  let net = 0
  for (const t of txs) {
    const txMs = new Date(t.occurredAt + 'T00:00:00Z').getTime()
    if (txMs <= startMs) continue
    if (t.kind === 'buy') {
      net += t.quantity * t.price + (t.fees ?? 0)
    } else {
      net -= t.quantity * t.price - (t.fees ?? 0)
    }
  }
  return net
}

// Find the close of the trading day that's closest to (and not after)
// `targetMs`. Falls back to the earliest available candle when the target
// predates everything we have. Returns null if the history cache is empty.
function priceAtOrBefore(
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
  // If target is before all our data, accept the first candle as a best
  // effort — the alternative is to refuse to render anything for newly
  // listed tickers, which is worse UX.
  return (chosen ?? history[0]).close
}

export function computePeriodPnl(
  ticker: string,
  currentQuantity: number,
  currentPrice: number,
  periodDays: number,
): PeriodPerformance | null {
  // Cached 1Y daily history covers everything from 1J to 1A. The cache
  // entry is the array we wrote in market-api.getHistory.
  const cache = readRaw<HistoricalCandle[]>(`history:${ticker}:1Y`)
  const history = cache?.data ?? []
  // No history yet — the dashboard will display "—" and tell the user to
  // hit Refresh. Better than synthesizing wrong numbers from thin air.
  if (history.length === 0) return null

  const startMs = Date.now() - periodDays * 86_400_000
  const startPrice = priceAtOrBefore(history, startMs)
  if (startPrice === null || startPrice <= 0) return null

  const startState = positionAtDate(ticker, startMs)
  const valueStart = startState.quantity * startPrice
  const valueNow = currentQuantity * currentPrice
  const netCash = netCashInvested(ticker, startMs)
  const periodPnl = valueNow - valueStart - netCash
  // Denominator: prefer the start value when the position pre-existed,
  // otherwise the cash actually deployed (so we don't divide by zero or
  // tiny start values that inflate the %).
  const denom = startState.quantity > 0 ? valueStart : Math.max(netCash, 1e-9)
  const periodPnlPct = (periodPnl / denom) * 100
  return {
    periodPnl,
    periodPnlPct,
    startPrice,
    existedAtStart: startState.quantity > 0,
  }
}

export const PERIOD_DAYS = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
} as const

export type PeriodKey = keyof typeof PERIOD_DAYS
