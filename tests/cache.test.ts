import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'

import { closeTestDb, makeTestDb } from './helpers/db'
import { cleanupExpiredCache, withCache, readRaw } from '../main/services/cache'

let db: Database.Database

beforeEach(() => {
  db = makeTestDb()
})

afterEach(() => {
  closeTestDb(db)
})

function insertCache(key: string, expiresAt: number, fetchedAt = Date.now()) {
  db.prepare(
    `INSERT INTO api_cache (key, payload, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(key, JSON.stringify({ ok: true }), fetchedAt, expiresAt)
}

describe('cache.cleanupExpiredCache', () => {
  it('deletes only rows whose expiry is older than the cutoff', () => {
    const now = Date.now()
    insertCache('quote:OLD', now - 10 * 86_400_000) // 10 days ago
    insertCache('quote:KEEP', now - 1 * 86_400_000) // 1 day ago (recent expiry)
    insertCache('quote:FRESH', now + 60_000) // not yet expired
    const result = cleanupExpiredCache(7 * 86_400_000)
    expect(result.deleted).toBe(1)
    const rows = db.prepare('SELECT key FROM api_cache ORDER BY key').all() as { key: string }[]
    expect(rows.map((r) => r.key)).toEqual(['quote:FRESH', 'quote:KEEP'])
  })

  it('returns 0 when nothing to clean', () => {
    const now = Date.now()
    insertCache('quote:FRESH', now + 60_000)
    expect(cleanupExpiredCache().deleted).toBe(0)
  })
})

describe('cache.withCache', () => {
  it('returns cached data without calling the fetcher when fresh', async () => {
    insertCache('quote:AAPL', Date.now() + 60_000)
    let calls = 0
    const result = await withCache(
      'quote:AAPL',
      async () => {
        calls++
        return { newData: true }
      },
      { ttlMs: 60_000 },
    )
    expect(calls).toBe(0)
    expect(result.stale).toBe(false)
    expect(result.data).toEqual({ ok: true })
  })

  it('calls the fetcher when the cache is expired and refreshes the entry', async () => {
    const past = Date.now() - 10_000
    db.prepare(
      `INSERT INTO api_cache (key, payload, fetched_at, expires_at) VALUES (?, ?, ?, ?)`,
    ).run('quote:NVDA', JSON.stringify({ ok: 'old' }), past - 60_000, past)
    const result = await withCache(
      'quote:NVDA',
      async () => ({ ok: 'new' }),
      { ttlMs: 60_000 },
    )
    expect(result.data).toEqual({ ok: 'new' })
    expect(result.stale).toBe(false)
    const persisted = readRaw<{ ok: string }>('quote:NVDA')
    expect(persisted?.data).toEqual({ ok: 'new' })
  })

  it('falls back to stale data when staleFallback=true and the fetcher throws', async () => {
    insertCache('quote:STALE', Date.now() - 10_000) // expired but exists
    const result = await withCache(
      'quote:STALE',
      async () => {
        throw new Error('upstream down')
      },
      { ttlMs: 60_000, staleFallback: true },
    )
    expect(result.stale).toBe(true)
    expect(result.data).toEqual({ ok: true })
  })

  it('rethrows when staleFallback=false and there is no cached entry', async () => {
    await expect(
      withCache('quote:NEW', async () => { throw new Error('boom') }, { ttlMs: 60_000 }),
    ).rejects.toThrow('boom')
  })
})
