import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'

import { runMigrations } from '../main/db/migrations'
import { seedSectors } from '../main/db/seed'

describe('migrations', () => {
  it('creates all expected tables on a fresh database', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((r) => r.name)
    expect(tables).toEqual(
      expect.arrayContaining([
        'api_cache',
        'portfolio_snapshots',
        'sectors',
        'settings',
        'tickers',
        'transactions',
      ]),
    )
    db.close()
  })

  it('is idempotent — running twice leaves user_version at the latest', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const first = db.pragma('user_version') as { user_version: number }[]
    runMigrations(db)
    const second = db.pragma('user_version') as { user_version: number }[]
    expect(first[0].user_version).toBe(second[0].user_version)
    expect(first[0].user_version).toBeGreaterThan(0)
    db.close()
  })

  it('seeds 12 default sectors and INSERT OR IGNORE prevents duplicates', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    seedSectors(db)
    seedSectors(db) // second call should be a no-op
    const count = (db.prepare('SELECT COUNT(*) AS n FROM sectors').get() as { n: number }).n
    expect(count).toBe(12)
    // ETF was added in v0.1.5 alongside the Yahoo provider so auto-detect
    // can bucket index funds without falling back to "other".
    const codes = (db
      .prepare('SELECT code FROM sectors ORDER BY code')
      .all() as { code: string }[]).map((r) => r.code)
    expect(codes).toContain('etf')
    db.close()
  })

  it('enforces buy/sell + USD/CAD check constraints', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    seedSectors(db)
    // Need a ticker first
    db.prepare(
      `INSERT INTO tickers (symbol, currency, updated_at) VALUES (?, 'USD', ?)`,
    ).run('AAPL', Date.now())
    expect(() =>
      db
        .prepare(
          `INSERT INTO transactions (ticker, kind, quantity, price, currency, occurred_at, created_at, updated_at)
           VALUES ('AAPL', 'hodl', 1, 1, 'USD', '2025-01-01', ?, ?)`,
        )
        .run(Date.now(), Date.now()),
    ).toThrow(/CHECK constraint/)
    expect(() =>
      db
        .prepare(
          `INSERT INTO transactions (ticker, kind, quantity, price, currency, occurred_at, created_at, updated_at)
           VALUES ('AAPL', 'buy', 1, 1, 'EUR', '2025-01-01', ?, ?)`,
        )
        .run(Date.now(), Date.now()),
    ).toThrow(/CHECK constraint/)
    db.close()
  })
})
