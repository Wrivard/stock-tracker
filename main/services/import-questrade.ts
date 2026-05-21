import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

import { getDb } from '../db/connection'
import { createTransaction } from '../db/repo/transactions'
import type { Currency, TransactionInput } from '../db/types'

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
  // Rows whose Activity Type is not "Trades" (FX conversions, deposits,
  // dividends, etc.) — we drop them on purpose.
  skippedNonTrade: number
  // Trade rows that failed validation (bad number, empty symbol, etc.).
  skippedInvalid: number
  // Tickers that didn't exist before this import — created automatically.
  newTickers: string[]
  // Per-account count, just for the toast.
  byAccount: Record<string, number>
  // The first 5 invalid rows so we can surface a hint in the toast/dialog.
  invalidReasons: string[]
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
    input: {
      ticker: symbol,
      kind: action === 'Buy' ? 'buy' : 'sell',
      quantity: absQuantity,
      price,
      currency,
      fees,
      notes: note,
      occurredAt,
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
  }

  // Snapshot the existing tickers BEFORE the import so we can report which
  // ones were created. createTransaction() will auto-create as needed.
  const existingTickers = new Set(
    (getDb()
      .prepare('SELECT symbol FROM tickers')
      .all() as Array<{ symbol: string }>).map((r) => r.symbol),
  )

  const insertAll = getDb().transaction((parsedRows: ParsedRow[]) => {
    for (const { input, accountLabel } of parsedRows) {
      createTransaction(input)
      summary.byAccount[accountLabel] =
        (summary.byAccount[accountLabel] ?? 0) + 1
      summary.imported++
      if (!existingTickers.has(input.ticker)) {
        if (!summary.newTickers.includes(input.ticker)) {
          summary.newTickers.push(input.ticker)
        }
        existingTickers.add(input.ticker)
      }
    }
  })

  const parsed: ParsedRow[] = []
  for (const row of rows) {
    const activityType = String(row['Activity Type'] ?? '').trim()
    if (activityType !== 'Trades') {
      summary.skippedNonTrade++
      continue
    }
    const result = rowToTransaction(row)
    if ('error' in result) {
      summary.skippedInvalid++
      if (summary.invalidReasons.length < 5) {
        summary.invalidReasons.push(result.error)
      }
      continue
    }
    parsed.push(result)
  }

  insertAll(parsed)

  return summary
}
