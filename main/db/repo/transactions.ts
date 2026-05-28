import { getDb } from '../connection'
import type {
  Currency,
  Transaction,
  TransactionInput,
  TransactionKind,
} from '../types'
import { ensureAccountFromQuestrade } from './accounts'
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

// Re-attach pre-v0.1.28 Questrade imports to accounts + populate
// external_id retroactively. Pre-v0.1.28 the importer wrote
// "Imported from Questrade · Individual FHSA #53543085" into notes
// but left account_id NULL because the table didn't exist yet.
// Same for external_id (added v0.1.31). This function walks those
// orphaned rows, resolves the account by broker number (creating
// it if necessary via the standard Questrade ensure helper), and
// writes back account_id + external_id so the row is properly
// linked AND a future re-import of the same XLSX won't duplicate it.
//
// Returns the count of rows touched and accounts that were newly
// created during the pass — surfaces to the UI toast.
export interface BackfillResult {
  attached: number
  accountsCreated: number
  alreadyOk: number
  unparseable: number
}

export function backfillQuestradeImports(): BackfillResult {
  const result: BackfillResult = {
    attached: 0,
    accountsCreated: 0,
    alreadyOk: 0,
    unparseable: 0,
  }

  // Candidates: any transaction whose notes look like a Questrade
  // import AND either account_id is NULL or external_id is NULL.
  const candidates = getDb()
    .prepare(
      `SELECT id, ticker, kind, quantity, price, occurred_at, account_id,
              external_id, notes
       FROM transactions
       WHERE notes LIKE 'Imported from Questrade%'
         AND (account_id IS NULL OR external_id IS NULL)`,
    )
    .all() as Array<{
    id: number
    ticker: string
    kind: string
    quantity: number
    price: number
    occurred_at: string
    account_id: number | null
    external_id: string | null
    notes: string
  }>

  const existingAccountIds = new Set(
    (
      getDb()
        .prepare('SELECT id FROM accounts')
        .all() as Array<{ id: number }>
    ).map((r) => r.id),
  )

  // notes pattern: "Imported from Questrade · <Account Type> #<Broker #>"
  // Account Type may or may not be present; broker # is what we
  // anchor on for the join into accounts. Use positional capture
  // groups (group 1 = type, group 2 = broker #) — named groups
  // aren't supported by the renderer's TS lib target.
  const NOTES_RE =
    /^Imported from Questrade · ([^·#]+?)(?: #(\d+))?\s*$/

  const update = getDb().prepare(
    `UPDATE transactions
       SET account_id = COALESCE(account_id, ?),
           external_id = COALESCE(external_id, ?)
       WHERE id = ?`,
  )

  for (const row of candidates) {
    const match = NOTES_RE.exec(row.notes)
    if (!match || !match[2]) {
      result.unparseable++
      continue
    }
    const accountNo = match[2]
    const accountType = (match[1] ?? '').trim()
    const acc = ensureAccountFromQuestrade({
      brokerAccountNumber: accountNo,
      accountTypeRaw: accountType,
    })
    if (!existingAccountIds.has(acc.id)) {
      result.accountsCreated++
      existingAccountIds.add(acc.id)
    }
    // External id MUST match the format used at import time
    // (services/import-questrade.ts rowToTransaction), minus
    // description — see comment over there. Otherwise a future
    // re-import won't recognize this row.
    const externalId = `qt:${accountNo}:${row.ticker}:${row.occurred_at}:${row.kind}:${row.quantity.toFixed(4)}:${row.price.toFixed(6)}`
    // Skip rows that are already fully OK.
    if (row.account_id !== null && row.external_id !== null) {
      result.alreadyOk++
      continue
    }
    update.run(acc.id, externalId, row.id)
    result.attached++
  }

  return result
}
