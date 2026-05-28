import { getDb } from '../connection'
import { getActiveProfileId, getDefaultProfileId } from './profiles'
import type {
  Currency,
  Dividend,
  DividendInput,
  DividendKind,
  DividendSource,
} from '../types'

interface DividendRow {
  id: number
  ticker: string | null
  account_id: number | null
  amount: number
  currency: string
  paid_at: string
  kind: string
  notes: string | null
  source: string
  external_id: string | null
  created_at: number
  updated_at: number
}

const rowToDividend = (r: DividendRow): Dividend => ({
  id: r.id,
  ticker: r.ticker,
  accountId: r.account_id,
  amount: r.amount,
  currency: r.currency as Currency,
  paidAt: r.paid_at,
  kind: r.kind as DividendKind,
  notes: r.notes,
  source: r.source as DividendSource,
  externalId: r.external_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export function listDividends(filter?: {
  ticker?: string | null
  accountId?: number | null
  sinceYyyyMmDd?: string
  allProfiles?: boolean
}): Dividend[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter?.ticker) {
    where.push('d.ticker = ?')
    params.push(filter.ticker.toUpperCase())
  }
  if (filter?.accountId !== undefined) {
    if (filter.accountId === null) {
      where.push('d.account_id IS NULL')
    } else {
      where.push('d.account_id = ?')
      params.push(filter.accountId)
    }
  }
  if (filter?.sinceYyyyMmDd) {
    where.push('d.paid_at >= ?')
    params.push(filter.sinceYyyyMmDd)
  }
  if (!filter?.allProfiles) {
    // Same NULL-scoping as listTransactions: orphan dividends only
    // show in the default profile, not leaking into every profile.
    const activeId = getActiveProfileId()
    const defaultId = getDefaultProfileId()
    where.push(
      '(a.profile_id = ? OR (d.account_id IS NULL AND ? = ?))',
    )
    params.push(activeId, activeId, defaultId)
  }
  let sql =
    'SELECT d.* FROM dividends d LEFT JOIN accounts a ON a.id = d.account_id'
  if (where.length > 0) sql += ' WHERE ' + where.join(' AND ')
  sql += ' ORDER BY d.paid_at DESC, d.id DESC'
  return (getDb().prepare(sql).all(...params) as DividendRow[]).map(
    rowToDividend,
  )
}

export function getDividendById(id: number): Dividend | null {
  const row = getDb()
    .prepare('SELECT * FROM dividends WHERE id = ?')
    .get(id) as DividendRow | undefined
  return row ? rowToDividend(row) : null
}

export function createDividend(input: DividendInput): Dividend {
  const now = Date.now()
  const ticker = input.ticker?.trim().toUpperCase() || null
  // Auto-create the ticker row if needed so the FK doesn't blow up
  // — same pattern as createTransaction.
  if (ticker) {
    const exists = getDb()
      .prepare('SELECT 1 FROM tickers WHERE symbol = ?')
      .get(ticker)
    if (!exists) {
      getDb()
        .prepare(
          `INSERT OR IGNORE INTO tickers (symbol, currency, updated_at)
           VALUES (?, ?, ?)`,
        )
        .run(ticker, input.currency, now)
    }
  }
  const result = getDb()
    .prepare(
      `INSERT INTO dividends
         (ticker, account_id, amount, currency, paid_at, kind, notes,
          source, external_id, created_at, updated_at)
       VALUES
         (@ticker, @accountId, @amount, @currency, @paidAt, @kind, @notes,
          @source, @externalId, @createdAt, @updatedAt)`,
    )
    .run({
      ticker,
      accountId: input.accountId ?? null,
      amount: input.amount,
      currency: input.currency,
      paidAt: input.paidAt,
      kind: input.kind ?? 'dividend',
      notes: input.notes ?? null,
      source: input.source ?? 'manual',
      externalId: input.externalId ?? null,
      createdAt: now,
      updatedAt: now,
    })
  return getDividendById(result.lastInsertRowid as number)!
}

export function updateDividend(
  id: number,
  input: Partial<DividendInput>,
): Dividend | null {
  const existing = getDividendById(id)
  if (!existing) return null
  const merged = { ...existing, ...input }
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE dividends
         SET ticker = ?, account_id = ?, amount = ?, currency = ?,
             paid_at = ?, kind = ?, notes = ?, source = ?, external_id = ?,
             updated_at = ?
       WHERE id = ?`,
    )
    .run(
      merged.ticker?.toUpperCase() ?? null,
      merged.accountId ?? null,
      merged.amount,
      merged.currency,
      merged.paidAt,
      merged.kind,
      merged.notes,
      merged.source,
      merged.externalId,
      now,
      id,
    )
  return getDividendById(id)
}

export function deleteDividend(id: number): void {
  getDb().prepare('DELETE FROM dividends WHERE id = ?').run(id)
}

// Used by the Questrade importer. external_id derived from the
// natural key (ticker + paid_at + amount) so re-imports skip rows we
// already inserted. Returns the row whether it existed or was just
// created.
export function upsertDividendFromExternalId(
  input: DividendInput & { externalId: string },
): Dividend {
  const existing = getDb()
    .prepare('SELECT * FROM dividends WHERE external_id = ?')
    .get(input.externalId) as DividendRow | undefined
  if (existing) return rowToDividend(existing)
  return createDividend(input)
}
