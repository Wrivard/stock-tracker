import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

import { getDb } from '../db/connection'
import { ensureAccountFromQuestrade } from '../db/repo/accounts'
import { upsertDividendFromExternalId } from '../db/repo/dividends'
import { createTransaction } from '../db/repo/transactions'
import type { Currency, DividendInput, TransactionInput } from '../db/types'

// Exact column headers Questrade emits in its "Activities" XLSX export.
// We pin them here so a format change shows up loudly as "Missing column"
// rather than silently importing garbage.
const REQUIRED_HEADERS = [
  'Transaction Date',
  'Action',
  'Symbol',
  'Quantity',
  'Price',
  'Commission',
  'Currency',
  'Activity Type',
  'Account Type',
] as const

type RawRow = Record<string, string | number | undefined>

export interface ImportSummary {
  imported: number
  // Rows that don't fall into Trades / Dividends — FX conversions,
  // contributions, withdrawals. We drop them on purpose.
  skippedNonTrade: number
  // Trade rows that failed validation (bad number, empty symbol, etc.).
  skippedInvalid: number
  // Tickers that didn't exist before this import — created automatically.
  newTickers: string[]
  // Per-account count of imported trades, just for the toast.
  byAccount: Record<string, number>
  // The first 5 invalid rows so we can surface a hint in the toast/dialog.
  invalidReasons: string[]
  // Dividends / distributions parsed from "Dividends" + "Interest"
  // Activity Type rows. dedupedExisting counts rows that already lived
  // in the DB via external_id (re-import case).
  dividendsImported: number
  dividendsExisting: number
}

function parseCurrency(c: unknown): Currency | null {
  const s = String(c ?? '').trim().toUpperCase()
  return s === 'USD' || s === 'CAD' ? s : null
}

function parseNumber(n: unknown): number | null {
  if (n === null || n === undefined || n === '') return null
  const v = typeof n === 'number' ? n : parseFloat(String(n))
  return Number.isFinite(v) ? v : null
}

// Questrade dates look like "2025-08-18 12:00:00 AM" — slicing the first 10
// chars yields the ISO yyyy-mm-dd that our schema expects.
function parseDate(d: unknown): string | null {
  const s = String(d ?? '').trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

interface ParsedRow {
  input: TransactionInput
  accountLabel: string
  // Raw Questrade fields we need to bind to an account_id during the
  // insert pass — the actual id is resolved inside the SQL transaction.
  accountTypeRaw: string
  accountNumberRaw: string
}

interface ParsedDividend {
  input: Omit<DividendInput, 'accountId'> & { externalId: string }
  accountTypeRaw: string
  accountNumberRaw: string
}

// Rows with Activity Type matching one of these are dividend / income
// events rather than trades. The Questrade taxonomy lumps several
// labels under each — match by lowercased substring so future-tense
// variations don't silently slip through.
const DIVIDEND_ACTIVITY_PATTERNS = [
  'dividend',
  'distribution',
  // Interest paid by Questrade (rare for retail equity accounts but
  // does happen in cash holdings + bond ETFs).
  'interest',
] as const

function detectDividendKind(
  activityType: string,
  action: string,
): DividendInput['kind'] | null {
  const t = `${activityType} ${action}`.toLowerCase()
  if (t.includes('interest')) return 'interest'
  if (t.includes('distribution')) return 'distribution'
  // Common Questrade Action strings for dividends:
  //   "DIV"      = cash dividend
  //   "REI"/"DRP" = dividend reinvestment (we treat as a dividend
  //                 event; the buy back into the position lands as a
  //                 separate Trade row Questrade emits alongside).
  if (
    t.includes('dividend') ||
    /\b(div|rei|drp)\b/.test(t)
  ) {
    return 'dividend'
  }
  return null
}

function rowToDividend(row: RawRow): ParsedDividend | { error: string } | null {
  const activityType = String(row['Activity Type'] ?? '').trim()
  const action = String(row['Action'] ?? '').trim()
  const haystack = activityType.toLowerCase()
  if (!DIVIDEND_ACTIVITY_PATTERNS.some((p) => haystack.includes(p))) {
    return null
  }
  const kind = detectDividendKind(activityType, action) ?? 'dividend'
  const symbol = String(row['Symbol'] ?? '').trim().toUpperCase() || null
  const occurredAt = parseDate(row['Transaction Date'])
  if (!occurredAt) return { error: `invalid dividend date${symbol ? ' for ' + symbol : ''}` }
  // Questrade's "Net Amount" is what actually landed in the account
  // (gross dividend minus withholding tax). That's what we want as
  // the income figure. Take abs() because Questrade sometimes signs
  // dividends positively, sometimes not.
  const amount = Math.abs(parseNumber(row['Net Amount']) ?? 0)
  if (amount <= 0) return { error: `zero dividend amount${symbol ? ' for ' + symbol : ''}` }
  const currency = parseCurrency(row['Currency'])
  if (!currency) return { error: `invalid currency${symbol ? ' for ' + symbol : ''}` }
  const accountNo = String(row['Account #'] ?? '').trim()
  // External id derived from natural-key fields. A re-import lands the
  // same string and the UNIQUE index on dividends.external_id makes the
  // upsert a no-op for already-known payments. Notes is included
  // because Questrade sometimes lists multiple payments for the same
  // ticker on the same date with different descriptions (different
  // share classes); using the description prevents the dedup from
  // collapsing them.
  const description = String(row['Description'] ?? '').trim()
  const externalId = `qt:${accountNo}:${symbol ?? '-'}:${occurredAt}:${amount.toFixed(4)}:${description.slice(0, 40)}`
  return {
    accountTypeRaw: String(row['Account Type'] ?? '').trim(),
    accountNumberRaw: accountNo,
    input: {
      ticker: symbol,
      amount,
      currency,
      paidAt: occurredAt,
      kind,
      source: 'questrade',
      externalId,
      notes: description || null,
    },
  }
}

function rowToTransaction(row: RawRow): ParsedRow | { error: string } {
  const action = String(row['Action'] ?? '').trim()
  if (action !== 'Buy' && action !== 'Sell') {
    return { error: `unsupported action "${action}"` }
  }
  const symbol = String(row['Symbol'] ?? '').trim().toUpperCase()
  if (!symbol) return { error: 'empty symbol' }

  const quantity = parseNumber(row['Quantity'])
  if (quantity === null) return { error: `invalid quantity for ${symbol}` }
  const price = parseNumber(row['Price'])
  if (price === null || price < 0) return { error: `invalid price for ${symbol}` }
  const currency = parseCurrency(row['Currency'])
  if (!currency) return { error: `invalid currency for ${symbol}` }
  const occurredAt = parseDate(row['Transaction Date'])
  if (!occurredAt) return { error: `invalid date for ${symbol}` }

  // Commission is reported as a NEGATIVE number on Buy rows in Questrade
  // exports (cash leaving the account). The schema wants a non-negative
  // magnitude, so abs() it.
  const fees = Math.abs(parseNumber(row['Commission']) ?? 0)

  // On Sell rows Questrade signs Quantity as negative; flip it so we always
  // store a positive magnitude.
  const absQuantity = Math.abs(quantity)
  if (absQuantity <= 0) return { error: `zero quantity for ${symbol}` }

  const accountType = String(row['Account Type'] ?? '').trim()
  const accountNo = String(row['Account #'] ?? '').trim()
  const accountLabel = accountType || accountNo || 'Questrade'
  const note = `Imported from Questrade · ${accountLabel}${accountNo ? ` #${accountNo}` : ''}`

  return {
    accountLabel,
    accountTypeRaw: accountType,
    accountNumberRaw: accountNo,
    input: {
      ticker: symbol,
      kind: action === 'Buy' ? 'buy' : 'sell',
      quantity: absQuantity,
      price,
      currency,
      fees,
      notes: note,
      occurredAt,
      // accountId is filled in during the SQL transaction below
      // because ensureAccountFromQuestrade may need to INSERT a new
      // accounts row first.
      accountId: null,
    },
  }
}

export function importQuestradeXlsx(filePath: string): ImportSummary {
  const buf = readFileSync(filePath)
  const wb = XLSX.read(buf, { type: 'buffer' })
  if (!wb.SheetNames.length) {
    throw new Error('XLSX has no sheets')
  }
  const ws = wb.Sheets[wb.SheetNames[0]]
  // Use raw:false so dates come back as the same display strings the user
  // sees in Excel — easier to reason about than serial numbers.
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { raw: false, defval: '' })
  if (rows.length === 0) {
    throw new Error('XLSX has no data rows')
  }

  // Surface a clear error if the headers don't match — better than failing
  // silently when Questrade renames a column.
  const firstRow = rows[0]
  const missing = REQUIRED_HEADERS.filter((h) => !(h in firstRow))
  if (missing.length > 0) {
    throw new Error(
      `XLSX is missing expected Questrade columns: ${missing.join(', ')}. ` +
        `Make sure this is an "Activities" export from Questrade.`,
    )
  }

  const summary: ImportSummary = {
    imported: 0,
    skippedNonTrade: 0,
    skippedInvalid: 0,
    newTickers: [],
    byAccount: {},
    invalidReasons: [],
    dividendsImported: 0,
    dividendsExisting: 0,
  }

  // Snapshot the existing tickers BEFORE the import so we can report which
  // ones were created. createTransaction() will auto-create as needed.
  const existingTickers = new Set(
    (getDb()
      .prepare('SELECT symbol FROM tickers')
      .all() as Array<{ symbol: string }>).map((r) => r.symbol),
  )

  // Memo for find-or-create-account per broker-account-number inside
  // the SQL transaction. We can't hoist the lookups outside the
  // transaction because new accounts get inserted here and need to
  // be readable on the next iteration.
  const accountByBrokerNumber = new Map<string, number>()
  function resolveAccountId(
    accountNumberRaw: string,
    accountTypeRaw: string,
    defaultCurrency: Currency,
  ): number | null {
    if (!accountNumberRaw) return null
    const cached = accountByBrokerNumber.get(accountNumberRaw)
    if (cached !== undefined) return cached
    const acc = ensureAccountFromQuestrade({
      brokerAccountNumber: accountNumberRaw,
      accountTypeRaw,
      defaultCurrency,
    })
    accountByBrokerNumber.set(accountNumberRaw, acc.id)
    return acc.id
  }

  const insertAll = getDb().transaction(
    (
      parsedRows: ParsedRow[],
      parsedDividends: ParsedDividend[],
    ) => {
      for (const row of parsedRows) {
        const accountId = resolveAccountId(
          row.accountNumberRaw,
          row.accountTypeRaw,
          row.input.currency,
        )
        createTransaction({ ...row.input, accountId })
        summary.byAccount[row.accountLabel] =
          (summary.byAccount[row.accountLabel] ?? 0) + 1
        summary.imported++
        if (!existingTickers.has(row.input.ticker)) {
          if (!summary.newTickers.includes(row.input.ticker)) {
            summary.newTickers.push(row.input.ticker)
          }
          existingTickers.add(row.input.ticker)
        }
      }
      for (const div of parsedDividends) {
        const accountId = resolveAccountId(
          div.accountNumberRaw,
          div.accountTypeRaw,
          div.input.currency,
        )
        // upsert by external_id — if a row with the same natural key
        // already exists, we get it back unchanged and count it as
        // dividendsExisting instead of importing again.
        const before = getDb()
          .prepare('SELECT 1 FROM dividends WHERE external_id = ?')
          .get(div.input.externalId)
        upsertDividendFromExternalId({ ...div.input, accountId })
        if (before) summary.dividendsExisting++
        else summary.dividendsImported++
      }
    },
  )

  const parsed: ParsedRow[] = []
  const parsedDividends: ParsedDividend[] = []
  for (const row of rows) {
    const activityType = String(row['Activity Type'] ?? '').trim()
    if (activityType === 'Trades') {
      const result = rowToTransaction(row)
      if ('error' in result) {
        summary.skippedInvalid++
        if (summary.invalidReasons.length < 5) {
          summary.invalidReasons.push(result.error)
        }
        continue
      }
      parsed.push(result)
      continue
    }
    // Dividends / Interest / Distributions captured separately.
    const divResult = rowToDividend(row)
    if (divResult === null) {
      summary.skippedNonTrade++
      continue
    }
    if ('error' in divResult) {
      // Don't conflate with trade-invalid count — these are dividend
      // rows that look malformed; treat as skipped non-trade so the
      // summary still tells the truth.
      summary.skippedNonTrade++
      if (summary.invalidReasons.length < 5) {
        summary.invalidReasons.push(divResult.error)
      }
      continue
    }
    parsedDividends.push(divResult)
  }

  insertAll(parsed, parsedDividends)

  return summary
}
