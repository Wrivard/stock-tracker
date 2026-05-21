import { getDb } from '../db/connection'

export interface CachedEntry<T> {
  data: T
  fetchedAt: number
  expiresAt: number
  stale: boolean
}

interface CacheRow {
  key: string
  payload: string
  fetched_at: number
  expires_at: number
}

function readCache<T>(key: string): { data: T; fetchedAt: number; expiresAt: number } | null {
  const row = getDb()
    .prepare('SELECT * FROM api_cache WHERE key = ?')
    .get(key) as CacheRow | undefined
  if (!row) return null
  try {
    return {
      data: JSON.parse(row.payload) as T,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
    }
  } catch {
    return null
  }
}

function writeCache(key: string, payload: unknown, ttlMs: number): { fetchedAt: number; expiresAt: number } {
  const now = Date.now()
  const expiresAt = now + ttlMs
  getDb()
    .prepare(
      `INSERT INTO api_cache (key, payload, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         payload    = excluded.payload,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at`,
    )
    .run(key, JSON.stringify(payload), now, expiresAt)
  return { fetchedAt: now, expiresAt }
}

interface WithCacheOptions {
  ttlMs: number
  // When true and the fetcher throws (rate limit, network…), fall back to the
  // last cached value (even if expired) and mark the result `stale`.
  staleFallback?: boolean
  // When true, ignore the cache and always refetch.
  bypass?: boolean
}

export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: WithCacheOptions,
): Promise<CachedEntry<T>> {
  const now = Date.now()
  const existing = readCache<T>(key)

  if (!opts.bypass && existing && existing.expiresAt > now) {
    return {
      data: existing.data,
      fetchedAt: existing.fetchedAt,
      expiresAt: existing.expiresAt,
      stale: false,
    }
  }

  try {
    const data = await fetcher()
    const { fetchedAt, expiresAt } = writeCache(key, data, opts.ttlMs)
    return { data, fetchedAt, expiresAt, stale: false }
  } catch (err) {
    if (opts.staleFallback && existing) {
      return {
        data: existing.data,
        fetchedAt: existing.fetchedAt,
        expiresAt: existing.expiresAt,
        stale: true,
      }
    }
    throw err
  }
}

export function invalidate(prefix: string): void {
  getDb().prepare('DELETE FROM api_cache WHERE key LIKE ?').run(`${prefix}%`)
}

// Remove cache rows whose `expires_at` is older than now - maxAgeMs. The
// default 7 days keeps stale-fallback recoveries available for a week
// while preventing the table from growing unbounded over months of use.
export function cleanupExpiredCache(maxAgeMs = 7 * 24 * 3600_000): {
  deleted: number
} {
  const cutoff = Date.now() - maxAgeMs
  const result = getDb()
    .prepare('DELETE FROM api_cache WHERE expires_at < ?')
    .run(cutoff)
  return { deleted: typeof result.changes === 'number' ? result.changes : 0 }
}

export function readRaw<T>(key: string): CachedEntry<T> | null {
  const row = readCache<T>(key)
  if (!row) return null
  return {
    data: row.data,
    fetchedAt: row.fetchedAt,
    expiresAt: row.expiresAt,
    stale: row.expiresAt < Date.now(),
  }
}
