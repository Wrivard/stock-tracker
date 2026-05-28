import { unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type Database from 'better-sqlite3'

import { closeTestDb, makeTestDb } from './helpers/db'
import { importQuestradeXlsx } from '../main/services/import-questrade'
import { listTransactions } from '../main/db/repo/transactions'
import { listTickers } from '../main/db/repo/tickers'
import { listAccounts } from '../main/db/repo/accounts'
import { listDividends } from '../main/db/repo/dividends'
import {
  backfillQuestradeImports,
  createTransaction,
} from '../main/db/repo/transactions'

let db: Database.Database

beforeEach(() => {
  db = makeTestDb()
})

afterEach(() => {
  closeTestDb(db)
})

// Headers Questrade emits in its real "Activities" export, used verbatim.
const HEADERS = [
  'Transaction Date',
  'Settlement Date',
  'Action',
  'Symbol',
  'Description',
  'Quantity',
  'Price',
  'Gross Amount',
  'Commission',
  'Net Amount',
  'Currency',
  'Account #',
  'Activity Type',
  'Account Type',
]

function writeWorkbook(rows: Array<Record<string, string | number>>): string {
  const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Activities')
  const path = join(tmpdir(), `qt-import-${Date.now()}-${Math.random()}.xlsx`)
  XLSX.writeFile(wb, path)
  return path
}

describe('import-questrade.importQuestradeXlsx', () => {
  it('imports buys and sells, skips non-trade rows', () => {
    const path = writeWorkbook([
      // A buy (positive quantity, negative cash).
      {
        'Transaction Date': '2025-08-18 12:00:00 AM',
        'Settlement Date': '2025-08-19 12:00:00 AM',
        'Action': 'Buy',
        'Symbol': 'SBET',
        'Description': 'SHARPLINK GAMING',
        'Quantity': '95.00000',
        'Price': '20.96880000',
        'Gross Amount': '-1992.04',
        'Commission': '0.00',
        'Net Amount': '-1992.04',
        'Currency': 'USD',
        'Account #': '53543085',
        'Activity Type': 'Trades',
        'Account Type': 'Individual FHSA',
      },
      // A sell (quantity is negative in Questrade exports).
      {
        'Transaction Date': '2025-07-25 12:00:00 AM',
        'Settlement Date': '2025-07-28 12:00:00 AM',
        'Action': 'Sell',
        'Symbol': 'GME',
        'Description': 'GAMESTOP CORP',
        'Quantity': '-2.00000',
        'Price': '23.57270000',
        'Gross Amount': '47.15',
        'Commission': '0.00',
        'Net Amount': '47.15',
        'Currency': 'USD',
        'Account #': '52278815',
        'Activity Type': 'Trades',
        'Account Type': 'Individual TFSA',
      },
      // An FX conversion (should be skipped).
      {
        'Transaction Date': '2025-08-18 12:00:00 AM',
        'Settlement Date': '2025-08-18 12:00:00 AM',
        'Action': 'FXT',
        'Symbol': '',
        'Description': 'CONVERSION - CAD/USD',
        'Quantity': '0.00000',
        'Price': '0.00000000',
        'Gross Amount': '0.00',
        'Commission': '0.00',
        'Net Amount': '1992.04',
        'Currency': 'USD',
        'Account #': '53543085',
        'Activity Type': 'FX conversion',
        'Account Type': 'Individual FHSA',
      },
      // A deposit (should be skipped).
      {
        'Transaction Date': '2025-08-18 12:00:00 AM',
        'Settlement Date': '2025-08-18 12:00:00 AM',
        'Action': 'CON',
        'Symbol': '',
        'Description': 'FHSA CONTRIBUTION',
        'Quantity': '0.00000',
        'Price': '0.00000000',
        'Gross Amount': '0.00',
        'Commission': '0.00',
        'Net Amount': '2800.00',
        'Currency': 'CAD',
        'Account #': '53543085',
        'Activity Type': 'Deposits',
        'Account Type': 'Individual FHSA',
      },
    ])
    try {
      const summary = importQuestradeXlsx(path)
      expect(summary.imported).toBe(2)
      expect(summary.skippedNonTrade).toBe(2)
      expect(summary.skippedInvalid).toBe(0)
      expect(summary.newTickers.sort()).toEqual(['GME', 'SBET'])
      expect(summary.byAccount).toEqual({
        'Individual FHSA': 1,
        'Individual TFSA': 1,
      })

      const txs = listTransactions().sort((a, b) =>
        a.ticker.localeCompare(b.ticker),
      )
      expect(txs).toHaveLength(2)
      const gme = txs.find((t) => t.ticker === 'GME')!
      const sbet = txs.find((t) => t.ticker === 'SBET')!
      // Sell quantity is normalized to its absolute magnitude.
      expect(gme.kind).toBe('sell')
      expect(gme.quantity).toBe(2)
      expect(gme.price).toBeCloseTo(23.5727, 4)
      expect(gme.occurredAt).toBe('2025-07-25')
      expect(sbet.kind).toBe('buy')
      expect(sbet.quantity).toBe(95)
      expect(sbet.price).toBeCloseTo(20.9688, 4)
      expect(sbet.fees).toBe(0)
      expect(sbet.occurredAt).toBe('2025-08-18')
      // Tickers were auto-created with the trade currency.
      const tickers = listTickers()
      expect(tickers.find((t) => t.symbol === 'SBET')?.currency).toBe('USD')
    } finally {
      unlinkSync(path)
    }
  })

  it('reports invalid rows without aborting the whole import', () => {
    const path = writeWorkbook([
      {
        'Transaction Date': '2025-08-18 12:00:00 AM',
        'Settlement Date': '2025-08-19 12:00:00 AM',
        'Action': 'Buy',
        'Symbol': 'AAPL',
        'Description': 'APPLE',
        'Quantity': '10',
        'Price': '180.00',
        'Gross Amount': '-1800.00',
        'Commission': '-9.95',
        'Net Amount': '-1809.95',
        'Currency': 'USD',
        'Account #': '53543085',
        'Activity Type': 'Trades',
        'Account Type': 'Individual FHSA',
      },
      // Bad quantity — should be flagged as invalid.
      {
        'Transaction Date': '2025-08-19 12:00:00 AM',
        'Settlement Date': '2025-08-20 12:00:00 AM',
        'Action': 'Buy',
        'Symbol': 'MSFT',
        'Description': 'MICROSOFT',
        'Quantity': 'nope',
        'Price': '400.00',
        'Gross Amount': '0.00',
        'Commission': '0.00',
        'Net Amount': '0.00',
        'Currency': 'USD',
        'Account #': '53543085',
        'Activity Type': 'Trades',
        'Account Type': 'Individual FHSA',
      },
    ])
    try {
      const summary = importQuestradeXlsx(path)
      expect(summary.imported).toBe(1)
      expect(summary.skippedInvalid).toBe(1)
      // Commission magnitude was preserved (positive).
      const tx = listTransactions()[0]
      expect(tx.fees).toBeCloseTo(9.95, 2)
    } finally {
      unlinkSync(path)
    }
  })

  it('throws on a workbook missing required headers', () => {
    const ws = XLSX.utils.json_to_sheet([{ Foo: 'bar', Baz: 'qux' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet')
    const path = join(tmpdir(), `qt-bad-${Date.now()}.xlsx`)
    XLSX.writeFile(wb, path)
    try {
      expect(() => importQuestradeXlsx(path)).toThrow(/missing expected/i)
    } finally {
      unlinkSync(path)
    }
  })

  it('creates one account per broker Account # and links transactions', () => {
    // Two FHSA trades + one TFSA trade — two distinct broker numbers,
    // so we expect two accounts to materialize and each transaction
    // to be linked to the correct one. The third Buy on the same
    // FHSA account # should reuse the existing account (no duplicate
    // accounts row).
    const path = writeWorkbook([
      {
        'Transaction Date': '2025-08-18 12:00:00 AM',
        'Settlement Date': '2025-08-19 12:00:00 AM',
        'Action': 'Buy',
        'Symbol': 'SBET',
        'Description': 'SHARPLINK',
        'Quantity': '10',
        'Price': '20.00',
        'Gross Amount': '-200.00',
        'Commission': '0.00',
        'Net Amount': '-200.00',
        'Currency': 'USD',
        'Account #': '53543085',
        'Activity Type': 'Trades',
        'Account Type': 'Individual FHSA',
      },
      {
        'Transaction Date': '2025-08-19 12:00:00 AM',
        'Settlement Date': '2025-08-20 12:00:00 AM',
        'Action': 'Buy',
        'Symbol': 'AAPL',
        'Description': 'APPLE',
        'Quantity': '5',
        'Price': '180.00',
        'Gross Amount': '-900.00',
        'Commission': '0.00',
        'Net Amount': '-900.00',
        'Currency': 'USD',
        'Account #': '53543085',
        'Activity Type': 'Trades',
        'Account Type': 'Individual FHSA',
      },
      {
        'Transaction Date': '2025-07-25 12:00:00 AM',
        'Settlement Date': '2025-07-28 12:00:00 AM',
        'Action': 'Sell',
        'Symbol': 'GME',
        'Description': 'GAMESTOP',
        'Quantity': '-2.00000',
        'Price': '23.57',
        'Gross Amount': '47.15',
        'Commission': '0.00',
        'Net Amount': '47.15',
        'Currency': 'USD',
        'Account #': '52278815',
        'Activity Type': 'Trades',
        'Account Type': 'Individual TFSA',
      },
    ])
    try {
      const summary = importQuestradeXlsx(path)
      expect(summary.imported).toBe(3)

      const accounts = listAccounts()
      expect(accounts).toHaveLength(2)
      const fhsa = accounts.find((a) => a.brokerAccountNumber === '53543085')!
      const tfsa = accounts.find((a) => a.brokerAccountNumber === '52278815')!
      expect(fhsa.kind).toBe('fhsa')
      expect(tfsa.kind).toBe('tfsa')

      const txs = listTransactions()
      const sbet = txs.find((t) => t.ticker === 'SBET')!
      const gme = txs.find((t) => t.ticker === 'GME')!
      expect(sbet.accountId).toBe(fhsa.id)
      expect(gme.accountId).toBe(tfsa.id)
    } finally {
      unlinkSync(path)
    }
  })

  it('imports Dividend rows into the dividends ledger', () => {
    const path = writeWorkbook([
      // A regular trade — sanity check that mixed rows still both
      // land in their respective tables.
      {
        'Transaction Date': '2025-08-18 12:00:00 AM',
        'Settlement Date': '2025-08-19 12:00:00 AM',
        'Action': 'Buy',
        'Symbol': 'AAPL',
        'Description': 'APPLE',
        'Quantity': '10',
        'Price': '180.00',
        'Gross Amount': '-1800.00',
        'Commission': '0.00',
        'Net Amount': '-1800.00',
        'Currency': 'USD',
        'Account #': '53543085',
        'Activity Type': 'Trades',
        'Account Type': 'Individual TFSA',
      },
      // A cash dividend.
      {
        'Transaction Date': '2025-09-12 12:00:00 AM',
        'Settlement Date': '2025-09-12 12:00:00 AM',
        'Action': 'DIV',
        'Symbol': 'AAPL',
        'Description': 'CASH DIV ON 10 SHARES',
        'Quantity': '0',
        'Price': '0',
        'Gross Amount': '2.40',
        'Commission': '0.00',
        'Net Amount': '2.40',
        'Currency': 'USD',
        'Account #': '53543085',
        'Activity Type': 'Dividends',
        'Account Type': 'Individual TFSA',
      },
      // An ETF distribution (Activity Type contains "distribution").
      {
        'Transaction Date': '2025-09-30 12:00:00 AM',
        'Settlement Date': '2025-09-30 12:00:00 AM',
        'Action': 'DIS',
        'Symbol': 'XEQT.TO',
        'Description': 'QTRLY DISTRIBUTION',
        'Quantity': '0',
        'Price': '0',
        'Gross Amount': '14.50',
        'Commission': '0.00',
        'Net Amount': '14.50',
        'Currency': 'CAD',
        'Account #': '53543085',
        'Activity Type': 'Distributions',
        'Account Type': 'Individual TFSA',
      },
    ])
    try {
      const summary = importQuestradeXlsx(path)
      expect(summary.imported).toBe(1)
      expect(summary.dividendsImported).toBe(2)
      expect(summary.dividendsExisting).toBe(0)

      const divs = listDividends()
      expect(divs).toHaveLength(2)
      const aapl = divs.find((d) => d.ticker === 'AAPL')!
      const xeqt = divs.find((d) => d.ticker === 'XEQT.TO')!
      expect(aapl.amount).toBeCloseTo(2.4, 2)
      expect(aapl.kind).toBe('dividend')
      expect(aapl.currency).toBe('USD')
      expect(aapl.source).toBe('questrade')
      expect(xeqt.amount).toBeCloseTo(14.5, 2)
      expect(xeqt.kind).toBe('distribution')
      expect(xeqt.currency).toBe('CAD')

      // Account linking should reach the dividends rows too.
      const accs = listAccounts()
      expect(accs).toHaveLength(1)
      expect(aapl.accountId).toBe(accs[0].id)
      expect(xeqt.accountId).toBe(accs[0].id)

      // Re-import the same file — dividends should NOT duplicate
      // because external_id is unique-indexed.
      const second = importQuestradeXlsx(path)
      expect(second.dividendsImported).toBe(0)
      expect(second.dividendsExisting).toBe(2)
      expect(listDividends()).toHaveLength(2)
    } finally {
      unlinkSync(path)
    }
  })

  it('backfillQuestradeImports re-attaches pre-v0.1.28 trades to accounts', () => {
    // Simulate a pre-v0.1.28 import: a transaction with the
    // canonical Questrade notes pattern but account_id and
    // external_id still NULL (as they would be on a row written by
    // the old importer).
    createTransaction({
      ticker: 'SBET',
      kind: 'buy',
      quantity: 95,
      price: 20.9688,
      currency: 'USD',
      fees: 0,
      notes: 'Imported from Questrade · Individual FHSA #53543085',
      occurredAt: '2025-08-18',
      // accountId NOT passed — repo writes NULL
      // externalId NOT passed — repo writes NULL
    })

    // Sanity: no accounts in the DB yet, the row is orphaned.
    expect(listAccounts()).toHaveLength(0)
    let txs = listTransactions()
    expect(txs).toHaveLength(1)
    expect(txs[0].accountId).toBeNull()
    expect(txs[0].externalId).toBeNull()

    const result = backfillQuestradeImports()
    expect(result.attached).toBe(1)
    expect(result.accountsCreated).toBe(1)
    expect(result.unparseable).toBe(0)

    // After backfill: account created with the right kind/broker
    // number, and the transaction has been linked + tagged with
    // the same external_id format that a re-import would generate.
    const accs = listAccounts()
    expect(accs).toHaveLength(1)
    expect(accs[0].kind).toBe('fhsa')
    expect(accs[0].brokerAccountNumber).toBe('53543085')

    txs = listTransactions()
    expect(txs[0].accountId).toBe(accs[0].id)
    expect(txs[0].externalId).toBe(
      'qt:53543085:SBET:2025-08-18:buy:95.0000:20.968800',
    )

    // Running again is a no-op (everything is already OK).
    const second = backfillQuestradeImports()
    expect(second.attached).toBe(0)
    expect(second.accountsCreated).toBe(0)
  })

  it('is idempotent on re-import: trades upsert by external_id', () => {
    // v0.1.31: re-importing the same XLSX no longer duplicates the
    // trade rows. external_id is built from (account, ticker, date,
    // kind, qty, price, description) and uniquely indexed, so the
    // second pass returns existingTrades=N and listTransactions()
    // is unchanged.
    const rows = [
      {
        'Transaction Date': '2025-08-18 12:00:00 AM',
        'Settlement Date': '2025-08-19 12:00:00 AM',
        'Action': 'Buy',
        'Symbol': 'SBET',
        'Description': 'SHARPLINK',
        'Quantity': '10',
        'Price': '20.00',
        'Gross Amount': '-200.00',
        'Commission': '0.00',
        'Net Amount': '-200.00',
        'Currency': 'USD',
        'Account #': '53543085',
        'Activity Type': 'Trades',
        'Account Type': 'Individual FHSA',
      },
    ]
    const path = writeWorkbook(rows)
    try {
      const first = importQuestradeXlsx(path)
      expect(first.imported).toBe(1)
      expect(first.existingTrades).toBe(0)

      const second = importQuestradeXlsx(path)
      expect(second.imported).toBe(0)
      expect(second.existingTrades).toBe(1)
      // Same ticker that was already in the DB, so no "new" ticker.
      expect(second.newTickers).toEqual([])
      // Crucial: only ONE row in transactions, not two.
      expect(listTransactions()).toHaveLength(1)
    } finally {
      unlinkSync(path)
    }
  })
})
