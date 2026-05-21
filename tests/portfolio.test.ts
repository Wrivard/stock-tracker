import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'

import { closeTestDb, makeTestDb } from './helpers/db'
import { createTransaction } from '../main/db/repo/transactions'
import { listSectors } from '../main/db/repo/sectors'
import { setTickerSector } from '../main/db/repo/tickers'
import { getPortfolioOverview } from '../main/services/portfolio'

let db: Database.Database

beforeEach(() => {
  db = makeTestDb()
})

afterEach(() => {
  closeTestDb(db)
})

// Insert a synthetic FX rate into api_cache so portfolio.ts can read it
// without going through the actual market-api fetcher.
function setUsdToCadRate(rate: number, fetchedAt = Date.now()) {
  const payload = JSON.stringify({
    from: 'USD',
    to: 'CAD',
    rate,
    date: '2025-01-01',
    fetchedAt,
  })
  db.prepare(
    `INSERT INTO api_cache (key, payload, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       payload = excluded.payload,
       fetched_at = excluded.fetched_at,
       expires_at = excluded.expires_at`,
  ).run('fx:USD->CAD', payload, fetchedAt, fetchedAt + 6 * 3600_000)
}

function setCachedQuote(
  symbol: string,
  price: number,
  change = 0,
  previousClose = price - change,
  fetchedAt = Date.now(),
) {
  const payload = JSON.stringify({
    symbol,
    price,
    change,
    changePercent: previousClose > 0 ? (change / previousClose) * 100 : 0,
    dayHigh: price,
    dayLow: price,
    open: previousClose,
    previousClose,
    fetchedAt,
  })
  db.prepare(
    `INSERT INTO api_cache (key, payload, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       payload = excluded.payload,
       fetched_at = excluded.fetched_at,
       expires_at = excluded.expires_at`,
  ).run(`quote:${symbol}`, payload, fetchedAt, fetchedAt + 60_000)
}

function setCachedEtfDetails(
  symbol: string,
  sectorWeightings: Record<string, number>,
  fetchedAt = Date.now(),
) {
  const payload = JSON.stringify({
    symbol,
    family: 'TestCo',
    category: null,
    sectorWeightings,
    holdings: [],
    fetchedAt,
  })
  db.prepare(
    `INSERT INTO api_cache (key, payload, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       payload = excluded.payload,
       fetched_at = excluded.fetched_at,
       expires_at = excluded.expires_at`,
  ).run(
    `etfDetails:${symbol}`,
    payload,
    fetchedAt,
    fetchedAt + 24 * 3600_000,
  )
}

describe('portfolio.getPortfolioOverview', () => {
  it('returns zeros when there are no holdings', () => {
    const ov = getPortfolioOverview('CAD')
    expect(ov.totalValue).toBe(0)
    expect(ov.totalCost).toBe(0)
    expect(ov.totalPnl).toBe(0)
    expect(ov.positions).toEqual([])
    expect(ov.sectors).toEqual([])
  })

  it('uses avg cost as the fallback price when no quote is cached', () => {
    createTransaction({
      ticker: 'AAPL', kind: 'buy', quantity: 10, price: 100,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    setUsdToCadRate(1.4)
    const ov = getPortfolioOverview('CAD')
    expect(ov.positions).toHaveLength(1)
    const p = ov.positions[0]
    expect(p.currentPrice).toBeNull()
    // marketValue falls back to cost when no quote: 10 * 100 USD * 1.4 = 1400 CAD
    expect(p.marketValue).toBeCloseTo(1400, 2)
    expect(p.costBasis).toBeCloseTo(1400, 2)
    expect(p.pnl).toBeCloseTo(0, 2)
    expect(p.quoteStale).toBe(true)
  })

  it('computes P&L correctly when a cached quote exists', () => {
    createTransaction({
      ticker: 'NVDA', kind: 'buy', quantity: 10, price: 100,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    setUsdToCadRate(1.4)
    setCachedQuote('NVDA', 150, 5) // current 150, day change +5
    const ov = getPortfolioOverview('CAD')
    const p = ov.positions[0]
    expect(p.currentPrice).toBe(150)
    // Market value: 10 * 150 USD * 1.4 = 2100 CAD
    expect(p.marketValue).toBeCloseTo(2100, 2)
    // Cost basis: 10 * 100 USD * 1.4 = 1400 CAD
    expect(p.costBasis).toBeCloseTo(1400, 2)
    expect(p.pnl).toBeCloseTo(700, 2)
    expect(p.pnlPct).toBeCloseTo(50, 2)
    // Day P&L: qty * change * fx = 10 * 5 * 1.4 = 70 CAD
    expect(p.dayPnl).toBeCloseTo(70, 2)
  })

  it('aggregates totals across USD + CAD positions in the chosen display currency', () => {
    createTransaction({
      ticker: 'AAPL', kind: 'buy', quantity: 10, price: 100,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    createTransaction({
      ticker: 'SHOP.TO', kind: 'buy', quantity: 20, price: 50,
      currency: 'CAD', occurredAt: '2025-01-02',
    })
    setUsdToCadRate(1.4)
    setCachedQuote('AAPL', 120)
    setCachedQuote('SHOP.TO', 60)
    const ov = getPortfolioOverview('CAD')
    // AAPL market: 10 * 120 * 1.4 = 1680, cost: 10 * 100 * 1.4 = 1400
    // SHOP.TO market: 20 * 60 = 1200, cost: 20 * 50 = 1000
    expect(ov.totalValue).toBeCloseTo(1680 + 1200, 2)
    expect(ov.totalCost).toBeCloseTo(1400 + 1000, 2)
    expect(ov.totalPnl).toBeCloseTo(480, 2)
  })

  it('weights sum to 100% across all positions', () => {
    createTransaction({
      ticker: 'A', kind: 'buy', quantity: 10, price: 100,
      currency: 'CAD', occurredAt: '2025-01-01',
    })
    createTransaction({
      ticker: 'B', kind: 'buy', quantity: 50, price: 20,
      currency: 'CAD', occurredAt: '2025-01-01',
    })
    setCachedQuote('A', 100)
    setCachedQuote('B', 20)
    const ov = getPortfolioOverview('CAD')
    const totalWeight = ov.positions.reduce((s, p) => s + p.weight, 0)
    expect(totalWeight).toBeCloseTo(100, 4)
  })

  it('aggregates market value by sector', () => {
    createTransaction({
      ticker: 'AAPL', kind: 'buy', quantity: 10, price: 100,
      currency: 'CAD', occurredAt: '2025-01-01',
    })
    createTransaction({
      ticker: 'JNJ', kind: 'buy', quantity: 5, price: 200,
      currency: 'CAD', occurredAt: '2025-01-02',
    })
    const sectors = listSectors()
    setTickerSector('AAPL', sectors.find((s) => s.code === 'tech')!.id, true)
    setTickerSector('JNJ', sectors.find((s) => s.code === 'health')!.id, true)
    setCachedQuote('AAPL', 110)
    setCachedQuote('JNJ', 210)
    const ov = getPortfolioOverview('CAD')
    const tech = ov.sectors.find((s) => s.code === 'tech')!
    const health = ov.sectors.find((s) => s.code === 'health')!
    expect(tech.value).toBeCloseTo(10 * 110, 2)
    expect(health.value).toBeCloseTo(5 * 210, 2)
    expect(tech.percent + health.percent).toBeCloseTo(100, 4)
  })

  it('falls back to 1:1 FX when the rate is not cached and flags it stale', () => {
    createTransaction({
      ticker: 'AAPL', kind: 'buy', quantity: 1, price: 100,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    // No setUsdToCadRate — fx cache empty
    const ov = getPortfolioOverview('CAD')
    expect(ov.fxUsdToCad).toBe(1)
    expect(ov.fxStale).toBe(true)
    // Conversion still works (1:1 fallback)
    expect(ov.positions[0].marketValue).toBeCloseTo(100, 2)
  })

  it('respects the display currency switch', () => {
    createTransaction({
      ticker: 'SHOP.TO', kind: 'buy', quantity: 10, price: 100,
      currency: 'CAD', occurredAt: '2025-01-01',
    })
    setUsdToCadRate(1.25)
    setCachedQuote('SHOP.TO', 120)
    const ovCad = getPortfolioOverview('CAD')
    const ovUsd = getPortfolioOverview('USD')
    expect(ovCad.totalValue).toBeCloseTo(1200, 2)
    expect(ovUsd.totalValue).toBeCloseTo(1200 / 1.25, 2)
  })

  it('groups holdings with missing sector under "other" code', () => {
    createTransaction({
      ticker: 'XYZ', kind: 'buy', quantity: 1, price: 10,
      currency: 'CAD', occurredAt: '2025-01-01',
    })
    setCachedQuote('XYZ', 10)
    const ov = getPortfolioOverview('CAD')
    // The position itself has sectorCode === null, but the sector aggregator
    // buckets it under code 'other'.
    expect(ov.positions[0].sectorCode).toBeNull()
    expect(ov.sectors.some((s) => s.code === 'other')).toBe(true)
  })
})

describe('portfolio.getPortfolioOverview — ETF look-through', () => {
  it('keeps ETFs in their bucket on sectorsRaw and splits them on sectors', () => {
    // 100 units of an ETF @ $10 = $1000 in the etf bucket
    createTransaction({
      ticker: 'XEQT.TO', kind: 'buy', quantity: 100, price: 10,
      currency: 'CAD', occurredAt: '2025-01-01',
    })
    // Assign the ETF to the etf sector
    const sectors = listSectors()
    const etfSectorId = sectors.find((s) => s.code === 'etf')!.id
    setTickerSector('XEQT.TO', etfSectorId, true)
    setCachedQuote('XEQT.TO', 10)
    setCachedEtfDetails('XEQT.TO', {
      tech: 0.4,
      finance: 0.3,
      health: 0.2,
      other: 0.1,
    })
    const ov = getPortfolioOverview('CAD')
    // Naive: 100% etf
    const rawEtf = ov.sectorsRaw.find((s) => s.code === 'etf')
    expect(rawEtf?.value).toBeCloseTo(1000, 2)
    // Look-through: 40% tech, 30% finance, 20% health, 10% other
    expect(ov.sectors.find((s) => s.code === 'tech')?.value).toBeCloseTo(400, 2)
    expect(ov.sectors.find((s) => s.code === 'finance')?.value).toBeCloseTo(300, 2)
    expect(ov.sectors.find((s) => s.code === 'health')?.value).toBeCloseTo(200, 2)
    expect(ov.sectors.find((s) => s.code === 'other')?.value).toBeCloseTo(100, 2)
    // No "etf" bucket in the look-through view when fully decomposed
    expect(ov.sectors.find((s) => s.code === 'etf')).toBeUndefined()
    expect(ov.lookThroughApplied).toContain('XEQT.TO')
  })

  it('falls back to the etf bucket when no composition is cached', () => {
    createTransaction({
      ticker: 'UNKNOWN-ETF.TO', kind: 'buy', quantity: 10, price: 100,
      currency: 'CAD', occurredAt: '2025-01-01',
    })
    const sectors = listSectors()
    const etfSectorId = sectors.find((s) => s.code === 'etf')!.id
    setTickerSector('UNKNOWN-ETF.TO', etfSectorId, true)
    setCachedQuote('UNKNOWN-ETF.TO', 100)
    // No setCachedEtfDetails — composition is unknown
    const ov = getPortfolioOverview('CAD')
    expect(ov.sectors.find((s) => s.code === 'etf')?.value).toBeCloseTo(1000, 2)
    expect(ov.lookThroughApplied).toHaveLength(0)
  })

  it('adds ETF sector contributions on top of direct equity positions', () => {
    // $1000 in an ETF that's 50% tech
    createTransaction({
      ticker: 'VEQ.TO', kind: 'buy', quantity: 10, price: 100,
      currency: 'CAD', occurredAt: '2025-01-01',
    })
    // $500 direct in AAPL (tech)
    createTransaction({
      ticker: 'AAPL', kind: 'buy', quantity: 5, price: 100,
      currency: 'CAD', occurredAt: '2025-01-01',
    })
    const sectors = listSectors()
    setTickerSector('VEQ.TO', sectors.find((s) => s.code === 'etf')!.id, true)
    setTickerSector('AAPL', sectors.find((s) => s.code === 'tech')!.id, true)
    setCachedQuote('VEQ.TO', 100)
    setCachedQuote('AAPL', 100)
    setCachedEtfDetails('VEQ.TO', { tech: 0.5, finance: 0.5 })
    const ov = getPortfolioOverview('CAD')
    const tech = ov.sectors.find((s) => s.code === 'tech')!
    // 500 (direct) + 500 (look-through from ETF's 50% tech) = 1000
    expect(tech.value).toBeCloseTo(1000, 2)
    // 500 of the tech value came from the ETF
    expect(tech.etfValue).toBeCloseTo(500, 2)
  })
})
