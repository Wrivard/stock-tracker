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
         (ticker, kind, quantity, price, currency, fees, notes, occurred_at, created_at, updated_at)
       VALUES
         (@ticker, @kind, @quantity, @price, @currency, @fees, @notes, @occurredAt, @createdAt, @updatedAt)`,
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
      createdAt: now,
      updatedAt: now,
    })

  return getTransactionById(result.lastInsertRowid as number)!
}

export function getTransactionById(id: number): Transaction | null {
  const row = getDb()
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(id) as TransactionRow | undefined
  return row ? rowToTransaction(row) : null
}

export function listTransactions(filter?: { ticker?: string }): Transaction[] {
  let sql = 'SELECT * FROM transactions'
  const params: unknown[] = []
  if (filter?.ticker) {
    sql += ' WHERE ticker = ?'
    params.push(filter.ticker.toUpperCase())
  }
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
       SET kind = ?, quantity = ?, price = ?, currency = ?, fees = ?, notes = ?, occurred_at = ?, updated_at = ?
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
      now,
      id,
    )

  return getTransactionById(id)
}

export function deleteTransaction(id: number): void {
  getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id)
}
