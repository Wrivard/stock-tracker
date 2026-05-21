import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'

import { closeTestDb, makeTestDb } from './helpers/db'
import { createTransaction } from '../main/db/repo/transactions'
import { computePortfolioTimeSeries } from '../main/services/timeseries'
import type { HistoricalCandle } from '../main/services/types'

let db: Database.Database

beforeEach(() => {
  db = makeTestDb()
})

afterEach(() => {
  closeTestDb(db)
})

function seedHistory(symbol: string, candles: HistoricalCandle[]) {
  const now = Date.now()
  db.prepare(
    `INSERT INTO api_cache (key, payload, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(`history:${symbol}:1Y`, JSON.stringify(candles), now, now + 6 * 3600_000)
}

function seedQuote(symbol: string, price: number) {
  const now = Date.now()
  const payload = JSON.stringify({
    symbol,
    price,
    change: 0,
    changePercent: 0,
    dayHigh: price,
    dayLow: price,
    open: price,
    previousClose: price,
    fetchedAt: now,
  })
  db.prepare(
    `INSERT INTO api_cache (key, payload, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(`quote:${symbol}`, payload, now, now + 60_000)
}

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

function txDaysAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

describe('timeseries.computePortfolioTimeSeries', () => {
  it('returns an empty series when the user has no holdings', () => {
    const r = computePortfolioTimeSeries('month', 'CAD')
    expect(r.points.length).toBeGreaterThan(0)
    expect(r.points.every((p) => p.value === 0)).toBe(true)
    expect(r.startValue).toBe(0)
    expect(r.endValue).toBe(0)
    expect(r.pnlPct).toBe(0)
  })

  it('reconstructs daily value for a single buy-and-hold position', () => {
    // 60 days of history, price ramps 100 → 130.
    seedHistory('AAPL', makeCandles(60, (back) => 130 - (back / 60) * 30))
    seedQuote('AAPL', 130)
    createTransaction({
      ticker: 'AAPL',
      kind: 'buy',
      quantity: 10,
      price: 100,
      currency: 'USD',
      occurredAt: txDaysAgo(45),
    })
    const r = computePortfolioTimeSeries('month', 'USD')
    expect(r.points.length).toBeGreaterThan(25)
    // First point ≈ 30 days ago when price ≈ 100 + (30/60)*30 = 115
    // → 10 shares × 115 ≈ 1150
    expect(r.startValue).toBeCloseTo(1150, 0)
    // Last point is overridden to use the live quote (130).
    expect(r.endValue).toBeCloseTo(1300, 0)
    expect(r.pnlPct).toBeCloseTo(13.0, 1)
    expect(r.missingTickers).toEqual([])
  })

  it('excludes tickers without cached history and reports them', () => {
    seedHistory('AAPL', makeCandles(60, () => 200))
    seedQuote('AAPL', 200)
    // No history seeded for ORPHAN.
    seedQuote('ORPHAN', 50)
    createTransaction({
      ticker: 'AAPL',
      kind: 'buy',
      quantity: 5,
      price: 200,
      currency: 'USD',
      occurredAt: txDaysAgo(45),
    })
    createTransaction({
      ticker: 'ORPHAN',
      kind: 'buy',
      quantity: 1,
      price: 50,
      currency: 'USD',
      occurredAt: txDaysAgo(45),
    })
    const r = computePortfolioTimeSeries('month', 'USD')
    expect(r.missingTickers).toContain('ORPHAN')
    // Series only reflects AAPL's value (5 × 200 = 1000), not ORPHAN's.
    expect(r.endValue).toBeCloseTo(1000, 0)
  })

  it('drops a position from the series before it was purchased', () => {
    seedHistory('MSFT', makeCandles(60, () => 100))
    seedQuote('MSFT', 100)
    // Bought MSFT only 10 days ago — earlier days should not include it.
    createTransaction({
      ticker: 'MSFT',
      kind: 'buy',
      quantity: 10,
      price: 100,
      currency: 'USD',
      occurredAt: txDaysAgo(10),
    })
    const r = computePortfolioTimeSeries('month', 'USD')
    // 30 days ago: quantity was 0 → value 0
    expect(r.points[0].value).toBe(0)
    // After the buy: value should be 1000
    expect(r.endValue).toBeCloseTo(1000, 0)
    // startValue is 0, so pnlPct stays 0 to avoid divide-by-zero.
    expect(r.pnlPct).toBe(0)
  })

  it('anchors "all" period to the earliest transaction date', () => {
    seedHistory('GME', makeCandles(180, () => 25))
    seedQuote('GME', 25)
    createTransaction({
      ticker: 'GME',
      kind: 'buy',
      quantity: 4,
      price: 25,
      currency: 'USD',
      occurredAt: txDaysAgo(100),
    })
    const r = computePortfolioTimeSeries('all', 'USD')
    // Series should start ~100 days ago, not 1y ago, since "all" anchors
    // to the user's earliest tx.
    expect(r.points.length).toBeGreaterThan(95)
    expect(r.points.length).toBeLessThan(115)
  })
})
