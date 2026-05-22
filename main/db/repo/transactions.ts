import { getDb } from '../connection'
import type {
  Currency,
  Transaction,
  TransactionInput,
  TransactionKind,
} from '../types'
import { getTickerBySymbol, upsertTicker } from './tickers'

interface TransactionRow {
  id: number
  ticker: string
  kind: string
  quantity: number
  price: number
  currency: string
  fees: number
  notes: string | null
  occurred_at: string
  account_id: number | null
  external_id: string | null
  created_at: number
  updated_at: number
}

const rowToTransaction = (r: TransactionRow): Transaction => ({
  id: r.id,
  ticker: r.ticker,
  kind: r.kind as TransactionKind,
  quantity: r.quantity,
  price: r.price,
  currency: r.currency as Currency,
  fees: r.fees,
  notes: r.notes,
  occurredAt: r.occurred_at,
  accountId: r.account_id,
  externalId: r.external_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export function createTransaction(input: TransactionInput): Transaction {
  const symbol = input.ticker.trim().toUpperCase()
  const now = Date.now()

  // Auto-create the ticker if it doesn't exist yet, using the transaction's
  // currency as the native currency. The currency can be overridden later.
  if (!getTickerBySymbol(symbol)) {
    upsertTicker({ symbol, currency: input.currency })
  }

  const result = getDb()
    .prepare(
      `INSERT INTO transactions
         (ticker, kind, quantity, price, currency, fees, notes, occurred_at, account_id, external_id, created_at, updated_at)
       VALUES
         (@ticker, @kind, @quantity, @price, @currency, @fees, @notes, @occurredAt, @accountId, @externalId, @createdAt, @updatedAt)`,
    )
    .run({
      ticker: symbol,
      kind: input.kind,
      quantity: input.quantity,
      price: input.price,
      currency: input.currency,
      fees: input.fees ?? 0,
      notes: input.notes ?? null,
      occurredAt: input.occurredAt,
      accountId: input.accountId ?? null,
      externalId: input.externalId ?? null,
      createdAt: now,
      updatedAt: now,
    })

  return getTransactionById(result.lastInsertRowid as number)!
}

// Used by the Questrade importer. external_id collisions mean the row
// was already imported in a previous pass — return the existing row
// without inserting. Mirrors upsertDividendFromExternalId.
export function upsertTransactionFromExternalId(
  input: TransactionInput & { externalId: string },
): { transaction: Transaction; created: boolean } {
  const existing = getDb()
    .prepare('SELECT * FROM transactions WHERE external_id = ?')
    .get(input.externalId) as TransactionRow | undefined
  if (existing) {
    return { transaction: rowToTransaction(existing), created: false }
  }
  return { transaction: createTransaction(input), created: true }
}

export function getTransactionById(id: number): Transaction | null {
  const row = getDb()
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(id) as TransactionRow | undefined
  return row ? rowToTransaction(row) : null
}

export function listTransactions(filter?: {
  ticker?: string
  accountId?: number | null
}): Transaction[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter?.ticker) {
    where.push('ticker = ?')
    params.push(filter.ticker.toUpperCase())
  }
  if (filter?.accountId !== undefined) {
    if (filter.accountId === null) {
      where.push('account_id IS NULL')
    } else {
      where.push('account_id = ?')
      params.push(filter.accountId)
    }
  }
  let sql = 'SELECT * FROM transactions'
  if (where.length > 0) sql += ' WHERE ' + where.join(' AND ')
  sql += ' ORDER BY occurred_at DESC, id DESC'
  const rows = getDb().prepare(sql).all(...params) as TransactionRow[]
  return rows.map(rowToTransaction)
}

export function updateTransaction(
  id: number,
  input: Partial<TransactionInput>,
): Transaction | null {
  const existing = getTransactionById(id)
  if (!existing) return null

  const merged = { ...existing, ...input }
  const now = Date.now()

  getDb()
    .prepare(
      `UPDATE transactions
       SET kind = ?, quantity = ?, price = ?, currency = ?, fees = ?, notes = ?, occurred_at = ?, account_id = ?, external_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      merged.kind,
      merged.quantity,
      merged.price,
      merged.currency,
      merged.fees,
      merged.notes,
      merged.occurredAt,
      merged.accountId,
      merged.externalId,
      now,
      id,
    )

  return getTransactionById(id)
}

export function deleteTransaction(id: number): void {
  getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id)
}
