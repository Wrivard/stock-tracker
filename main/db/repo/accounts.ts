import { getDb } from '../connection'
import { getActiveProfileId } from './profiles'
import type { Account, AccountInput, AccountKind, Currency } from '../types'

interface AccountRow {
  id: number
  name: string
  kind: string
  broker_account_number: string | null
  default_currency: string | null
  profile_id: number
  created_at: number
  updated_at: number
}

const rowToAccount = (r: AccountRow): Account => ({
  id: r.id,
  name: r.name,
  kind: r.kind as AccountKind,
  brokerAccountNumber: r.broker_account_number,
  defaultCurrency: (r.default_currency as Currency | null) ?? null,
  profileId: r.profile_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export function listAccounts(opts?: { allProfiles?: boolean }): Account[] {
  // Default = current profile only. Callers that genuinely need
  // every account across profiles (the profile-management UI, the
  // backfill helper) pass allProfiles: true.
  if (opts?.allProfiles) {
    return (
      getDb()
        .prepare('SELECT * FROM accounts ORDER BY name')
        .all() as AccountRow[]
    ).map(rowToAccount)
  }
  return (
    getDb()
      .prepare(
        'SELECT * FROM accounts WHERE profile_id = ? ORDER BY name',
      )
      .all(getActiveProfileId()) as AccountRow[]
  ).map(rowToAccount)
}

export function getAccountById(id: number): Account | null {
  const row = getDb()
    .prepare('SELECT * FROM accounts WHERE id = ?')
    .get(id) as AccountRow | undefined
  return row ? rowToAccount(row) : null
}

// Find by broker number — used by the Questrade importer to de-dupe
// across re-imports. Scoped to the active profile so importing the
// same broker statement into a fresh profile creates a NEW account
// row there instead of cross-linking with another profile's account.
// The DB-level UNIQUE constraint on broker_account_number predates
// the profile column; if the user re-imports a broker statement
// they already have on another profile they'll hit a constraint
// error (rare in practice — different people have different broker
// account numbers).
export function getAccountByBrokerNumber(
  brokerAccountNumber: string,
): Account | null {
  const row = getDb()
    .prepare(
      'SELECT * FROM accounts WHERE broker_account_number = ? AND profile_id = ?',
    )
    .get(brokerAccountNumber, getActiveProfileId()) as AccountRow | undefined
  return row ? rowToAccount(row) : null
}

export function createAccount(input: AccountInput): Account {
  const now = Date.now()
  // Default to the active profile when the caller doesn't pick one —
  // mirrors the Settings UI affordance.
  const profileId = input.profileId ?? getActiveProfileId()
  const result = getDb()
    .prepare(
      `INSERT INTO accounts
         (name, kind, broker_account_number, default_currency, profile_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.kind,
      input.brokerAccountNumber ?? null,
      input.defaultCurrency ?? null,
      profileId,
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
             profile_id = ?,
             updated_at = ?
       WHERE id = ?`,
    )
    .run(
      merged.name,
      merged.kind,
      merged.brokerAccountNumber,
      merged.defaultCurrency,
      merged.profileId,
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
