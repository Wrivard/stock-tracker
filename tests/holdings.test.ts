import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'

import { closeTestDb, makeTestDb } from './helpers/db'
import { listHoldings, getHolding } from '../main/db/repo/holdings'
import { createTransaction } from '../main/db/repo/transactions'
import { listSectors } from '../main/db/repo/sectors'
import { setTickerSector } from '../main/db/repo/tickers'

let db: Database.Database

beforeEach(() => {
  db = makeTestDb()
})

afterEach(() => {
  closeTestDb(db)
})

describe('holdings.listHoldings', () => {
  it('returns an empty array when no tickers exist', () => {
    expect(listHoldings()).toEqual([])
  })

  it('computes qty and avg cost from a single buy', () => {
    createTransaction({
      ticker: 'AAPL',
      kind: 'buy',
      quantity: 10,
      price: 150,
      currency: 'USD',
      occurredAt: '2025-01-15',
    })
    const holdings = listHoldings()
    expect(holdings).toHaveLength(1)
    expect(holdings[0].ticker).toBe('AAPL')
    expect(holdings[0].quantity).toBe(10)
    expect(holdings[0].avgCost).toBe(150)
    expect(holdings[0].totalCost).toBe(1500)
    expect(holdings[0].buyCount).toBe(1)
    expect(holdings[0].sellCount).toBe(0)
  })

  it('uses weighted average across multiple buys', () => {
    // Buy 10 @ $100 ($1000), then 20 @ $200 ($4000)
    // Avg = 5000 / 30 = 166.6666...
    createTransaction({
      ticker: 'MSFT', kind: 'buy', quantity: 10, price: 100,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    createTransaction({
      ticker: 'MSFT', kind: 'buy', quantity: 20, price: 200,
      currency: 'USD', occurredAt: '2025-01-15',
    })
    const [h] = listHoldings()
    expect(h.quantity).toBe(30)
    expect(h.avgCost).toBeCloseTo(166.6667, 4)
    expect(h.totalCost).toBeCloseTo(5000, 2)
  })

  it('does not shift avg cost when partial sell is recorded', () => {
    // Buy 10 @ $100, then sell 5 @ $300 (above market).
    // Avg cost must stay at $100; only qty decreases.
    createTransaction({
      ticker: 'NVDA', kind: 'buy', quantity: 10, price: 100,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    createTransaction({
      ticker: 'NVDA', kind: 'sell', quantity: 5, price: 300,
      currency: 'USD', occurredAt: '2025-02-01',
    })
    const [h] = listHoldings()
    expect(h.quantity).toBe(5)
    expect(h.avgCost).toBe(100)
    expect(h.totalCost).toBe(500)
    expect(h.buyCount).toBe(1)
    expect(h.sellCount).toBe(1)
  })

  it('hides zero-quantity positions unless includeEmpty=true', () => {
    createTransaction({
      ticker: 'IBM', kind: 'buy', quantity: 5, price: 100,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    createTransaction({
      ticker: 'IBM', kind: 'sell', quantity: 5, price: 110,
      currency: 'USD', occurredAt: '2025-01-15',
    })
    expect(listHoldings(false)).toHaveLength(0)
    const withEmpty = listHoldings(true)
    expect(withEmpty).toHaveLength(1)
    expect(withEmpty[0].quantity).toBe(0)
  })

  it('treats fees as part of cost basis', () => {
    createTransaction({
      ticker: 'GME', kind: 'buy', quantity: 10, price: 50, fees: 5,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    const [h] = listHoldings()
    // total_buy_cost = 10*50 + 5 = 505 ; avg = 50.50
    expect(h.avgCost).toBeCloseTo(50.5, 4)
    expect(h.totalCost).toBeCloseTo(505, 2)
  })

  it('groups by ticker independently when several positions exist', () => {
    createTransaction({
      ticker: 'AAPL', kind: 'buy', quantity: 10, price: 150,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    createTransaction({
      ticker: 'SHOP.TO', kind: 'buy', quantity: 25, price: 80,
      currency: 'CAD', occurredAt: '2025-01-02',
    })
    const holdings = listHoldings().sort((a, b) => a.ticker.localeCompare(b.ticker))
    expect(holdings.map((h) => h.ticker)).toEqual(['AAPL', 'SHOP.TO'])
    expect(holdings[0].currency).toBe('USD')
    expect(holdings[1].currency).toBe('CAD')
  })

  it('reflects sector assignment via joined columns', () => {
    createTransaction({
      ticker: 'AAPL', kind: 'buy', quantity: 1, price: 100,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    const tech = listSectors().find((s) => s.code === 'tech')!
    setTickerSector('AAPL', tech.id, true)
    const [h] = listHoldings()
    expect(h.sectorId).toBe(tech.id)
    expect(h.sectorCode).toBe('tech')
    expect(h.sectorLabelFr).toBe('Technologie')
  })

  it('survives cascade delete: removing a ticker drops its transactions', () => {
    createTransaction({
      ticker: 'BB.TO', kind: 'buy', quantity: 100, price: 5,
      currency: 'CAD', occurredAt: '2025-01-01',
    })
    expect(listHoldings()).toHaveLength(1)
    db.prepare('DELETE FROM tickers WHERE symbol = ?').run('BB.TO')
    expect(listHoldings()).toHaveLength(0)
    const remaining = db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }
    expect(remaining.n).toBe(0)
  })

  it('getHolding returns null for unknown ticker', () => {
    createTransaction({
      ticker: 'AAPL', kind: 'buy', quantity: 1, price: 100,
      currency: 'USD', occurredAt: '2025-01-01',
    })
    expect(getHolding('AAPL')).not.toBeNull()
    expect(getHolding('UNKNOWN')).toBeNull()
  })
})
