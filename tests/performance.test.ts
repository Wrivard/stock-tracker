import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'

import { closeTestDb, makeTestDb } from './helpers/db'
import { createTransaction } from '../main/db/repo/transactions'
import { computePeriodPnl } from '../main/services/performance'
import type { HistoricalCandle } from '../main/services/types'

let db: Database.Database

beforeEach(() => {
  db = makeTestDb()
})

afterEach(() => {
  closeTestDb(db)
})

// Inject a synthetic 1Y candle series into the api_cache. We control
// price-at-date by writing whatever closes we need; the cache key matches
// what market-api.getHistory uses.
function seedHistory(symbol: string, candles: HistoricalCandle[]) {
  const now = Date.now()
  db.prepare(
    `INSERT INTO api_cache (key, payload, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(`history:${symbol}:1Y`, JSON.stringify(candles), now, now + 6 * 3600_000)
}

// Build a candle array of length `days` ending today. close[i] for i days
// back is given by `priceFn(daysBack)` — handy for monotonic ramps and
// step changes alike.
function makeCandles(
  days: number,
  priceFn: (daysBack: number) => number,
): HistoricalCandle[] {
  const out: HistoricalCandle[] = []
  for (let i = days; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000)
    const iso = d.toISOString().slice(0, 10)
    const c = priceFn(i)
    out.push({ date: iso, open: c, high: c, low: c, close: c, volume: 0 })
  }
  return out
}

// Helper to insert a transaction at a fixed date offset (days before today).
function txDaysAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

describe('performance.computePeriodPnl', () => {
  it('returns null when no history is cached', () => {
    expect(computePeriodPnl('AAPL', 10, 200, 30)).toBeNull()
  })

  it('computes the % move for a position held the whole window', () => {
    // 365 daily candles. Price ramps from 100 (1y ago) to 200 (today).
    seedHistory('AAPL', makeCandles(365, (back) => 200 - (back / 365) * 100))
    createTransaction({
      ticker: 'AAPL',
      kind: 'buy',
      quantity: 10,
      price: 100,
      currency: 'USD',
      occurredAt: txDaysAgo(400), // bought before our window starts
    })
    const r = computePeriodPnl('AAPL', 10, 200, 30)!
    // Price 30 days ago ≈ 200 - (30/365)*100 ≈ 191.78. With 10 shares and
    // no cash flow during the period: pnl ≈ 10*(200-191.78) ≈ 82.2,
    // pct ≈ 82.2 / 1917.8 ≈ 4.3%.
    expect(r.existedAtStart).toBe(true)
    expect(r.periodPnlPct).toBeCloseTo(4.29, 1)
    expect(r.periodPnl).toBeCloseTo(82.19, 1)
  })

  it('correctly handles a position opened during the window', () => {
    seedHistory('NVDA', makeCandles(365, () => 100))
    createTransaction({
      ticker: 'NVDA',
      kind: 'buy',
      quantity: 5,
      price: 100,
      currency: 'USD',
      occurredAt: txDaysAgo(15), // bought 15 days into a 30-day window
    })
    // Today's price doubled to 200.
    const r = computePeriodPnl('NVDA', 5, 200, 30)!
    expect(r.existedAtStart).toBe(false)
    // valueStart = 0, valueNow = 1000, netCash = 500 → pnl = 500
    expect(r.periodPnl).toBeCloseTo(500, 1)
    // Denominator falls back to netCash, so % = 500 / 500 = 100%.
    expect(r.periodPnlPct).toBeCloseTo(100, 1)
  })

  it('subtracts the buy cash flow when the user adds to the position', () => {
    // Stable 100 throughout, then today's price is 110.
    seedHistory('MSFT', makeCandles(365, () => 100))
    // Pre-existing position from before the window.
    createTransaction({
      ticker: 'MSFT',
      kind: 'buy',
      quantity: 5,
      price: 100,
      currency: 'USD',
      occurredAt: txDaysAgo(60),
    })
    // Add 5 more in the middle of the 30-day window at $105.
    createTransaction({
      ticker: 'MSFT',
      kind: 'buy',
      quantity: 5,
      price: 105,
      currency: 'USD',
      occurredAt: txDaysAgo(15),
    })
    const r = computePeriodPnl('MSFT', 10, 110, 30)!
    // valueStart = 5 * 100 = 500
    // valueNow = 10 * 110 = 1100
    // netCash = 5 * 105 = 525
    // pnl = 1100 - 500 - 525 = 75
    // % = 75 / 500 = 15%
    expect(r.periodPnl).toBeCloseTo(75, 1)
    expect(r.periodPnlPct).toBeCloseTo(15, 1)
  })

  it('treats a partial sale as realized cash flowing out', () => {
    seedHistory('GME', makeCandles(365, () => 20))
    // Owned 10 since well before the window.
    createTransaction({
      ticker: 'GME',
      kind: 'buy',
      quantity: 10,
      price: 20,
      currency: 'USD',
      occurredAt: txDaysAgo(60),
    })
    // Sold 4 during the window at $25.
    createTransaction({
      ticker: 'GME',
      kind: 'sell',
      quantity: 4,
      price: 25,
      currency: 'USD',
      occurredAt: txDaysAgo(15),
    })
    // Today's price 22.
    const r = computePeriodPnl('GME', 6, 22, 30)!
    // valueStart = 10 * 20 = 200
    // valueNow = 6 * 22 = 132
    // netCash = -(4 * 25) = -100  (cash came back)
    // pnl = 132 - 200 - (-100) = 32
    // % = 32 / 200 = 16%
    expect(r.periodPnl).toBeCloseTo(32, 1)
    expect(r.periodPnlPct).toBeCloseTo(16, 1)
  })

  it('uses the earliest candle when the start date predates history', () => {
    // Only 10 days of history but the user asks for a 1Y window.
    seedHistory('NEW', makeCandles(10, () => 50))
    createTransaction({
      ticker: 'NEW',
      kind: 'buy',
      quantity: 1,
      price: 50,
      currency: 'USD',
      occurredAt: txDaysAgo(5),
    })
    const r = computePeriodPnl('NEW', 1, 75, 365)
    // Should still return a number (using best-effort earliest candle as
    // the start price), not bail out.
    expect(r).not.toBeNull()
    expect(r!.periodPnl).toBeGreaterThan(0)
  })
})
