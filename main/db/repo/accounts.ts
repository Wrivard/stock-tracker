import { getDb } from '../connection'
import type { Account, AccountInput, AccountKind, Currency } from '../types'

interface AccountRow {
  id: number
  name: string
  kind: string
  broker_account_number: string | null
  default_currency: string | null
  created_at: number
  updated_at: number
}

const rowToAccount = (r: AccountRow): Account => ({
  id: r.id,
  name: r.name,
  kind: r.kind as AccountKind,
  brokerAccountNumber: r.broker_account_number,
  defaultCurrency: (r.default_currency as Currency | null) ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export function listAccounts(): Account[] {
  return (
    getDb()
      .prepare('SELECT * FROM accounts ORDER BY name')
      .all() as AccountRow[]
  ).map(rowToAccount)
}

export function getAccountById(id: number): Account | null {
  const row = getDb()
    .prepare('SELECT * FROM accounts WHERE id = ?')
    .get(id) as AccountRow | undefined
  return row ? rowToAccount(row) : null
}

// Find by broker number — used by the Questrade importer to de-dupe
// across re-imports. Returns null when the user has never imported a
// statement for that account.
export function getAccountByBrokerNumber(
  brokerAccountNumber: string,
): Account | null {
  const row = getDb()
    .prepare('SELECT * FROM accounts WHERE broker_account_number = ?')
    .get(brokerAccountNumber) as AccountRow | undefined
  return row ? rowToAccount(row) : null
}

export function createAccount(input: AccountInput): Account {
  const now = Date.now()
  const result = getDb()
    .prepare(
      `INSERT INTO accounts
         (name, kind, broker_account_number, default_currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.kind,
      input.brokerAccountNumber ?? null,
      input.defaultCurrency ?? null,
      now,
      now,
    )
  return getAccountById(result.lastInsertRowid as number)!
}

export function updateAccount(
  id: number,
  input: Partial<AccountInput>,
): Account | null {
  const existing = getAccountById(id)
  if (!existing) return null
  const merged = { ...existing, ...input }
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE accounts
         SET name = ?,
             kind = ?,
             broker_account_number = ?,
             default_currency = ?,
             updated_at = ?
       WHERE id = ?`,
    )
    .run(
      merged.name,
      merged.kind,
      merged.brokerAccountNumber,
      merged.defaultCurrency,
      now,
      id,
    )
  return getAccountById(id)
}

export function deleteAccount(id: number): void {
  // ON DELETE SET NULL on transactions.account_id will detach any
  // transactions from this account but preserve them in the ledger
  // (becoming "uncategorized"). This matches user expectation —
  // they want to delete an account, not the trade history.
  getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id)
}

// Convenience used by the Questrade importer: find-or-create an
// account based on the broker number, populating a sensible default
// name + kind from the Questrade Account Type string. Returns the
// account row whether freshly created or pre-existing.
export function ensureAccountFromQuestrade(args: {
  brokerAccountNumber: string
  accountTypeRaw: string
  defaultCurrency?: Currency | null
}): Account {
  const existing = getAccountByBrokerNumber(args.brokerAccountNumber)
  if (existing) return existing
  // Heuristic mapping from Questrade's free-text "Account Type" string
  // (e.g. "Individual TFSA", "Individual FHSA") to our enum. Anything
  // we don't recognize falls through to 'other' so the row can still
  // be inserted; the user can re-classify later in the Accounts UI.
  const t = args.accountTypeRaw.toLowerCase()
  let kind: AccountKind = 'other'
  if (t.includes('tfsa') || t.includes('celi')) kind = 'tfsa'
  else if (t.includes('rrsp') || t.includes('reer')) kind = 'rrsp'
  else if (t.includes('fhsa') || t.includes('celiapp')) kind = 'fhsa'
  else if (t.includes('lira')) kind = 'lira'
  else if (t.includes('resp') || t.includes('reee')) kind = 'resp'
  else if (
    t.includes('cash') ||
    t.includes('margin') ||
    t.includes('taxable') ||
    t.includes('individual')
  ) {
    // Generic "Individual" without a registered-plan tag is a taxable
    // cash/margin account on Questrade.
    kind = 'taxable'
  }
  return createAccount({
    name: args.accountTypeRaw || `Account ${args.brokerAccountNumber}`,
    kind,
    brokerAccountNumber: args.brokerAccountNumber,
    defaultCurrency: args.defaultCurrency ?? null,
  })
}
