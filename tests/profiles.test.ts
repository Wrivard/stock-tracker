import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'

import { closeTestDb, makeTestDb } from './helpers/db'
import {
  createProfile,
  listProfiles,
  setActiveProfileId,
} from '../main/db/repo/profiles'
import { createAccount } from '../main/db/repo/accounts'
import { listHoldings } from '../main/db/repo/holdings'
import { createTransaction, listTransactions } from '../main/db/repo/transactions'
import { listDividends, createDividend } from '../main/db/repo/dividends'

let db: Database.Database

beforeEach(() => {
  db = makeTestDb()
})

afterEach(() => {
  closeTestDb(db)
})

describe('profiles isolation', () => {
  it('NULL-account transactions only surface in the default profile', () => {
    // The v6 migration seeded profile id=1. A second profile gets
    // created by the user for, say, their partner.
    const emma = createProfile({ name: 'Emma' })
    expect(emma.id).toBeGreaterThan(1)

    // Pre-existing trade with account_id NULL — simulates a row that
    // landed in the user's DB before they imported their broker
    // statement or set up any accounts.
    createTransaction({
      ticker: 'SBET',
      kind: 'buy',
      quantity: 10,
      price: 20,
      currency: 'USD',
      occurredAt: '2025-01-01',
      // no accountId — stays NULL
    })

    // Active profile = default (1). The orphan trade should appear.
    setActiveProfileId(1)
    expect(listTransactions()).toHaveLength(1)
    const holdingsP1 = listHoldings()
    expect(holdingsP1).toHaveLength(1)
    expect(holdingsP1[0].ticker).toBe('SBET')
    expect(holdingsP1[0].quantity).toBe(10)

    // Switch to Emma's profile — the orphan trade should NOT leak.
    setActiveProfileId(emma.id)
    expect(listTransactions()).toHaveLength(0)
    expect(listHoldings()).toHaveLength(0)
  })

  it('account-attached transactions stay in their owning profile only', () => {
    const emma = createProfile({ name: 'Emma' })

    // Default-profile account + trade.
    setActiveProfileId(1)
    const tfsa = createAccount({
      name: 'TFSA',
      kind: 'tfsa',
    })
    createTransaction({
      ticker: 'AAPL',
      kind: 'buy',
      quantity: 5,
      price: 180,
      currency: 'USD',
      occurredAt: '2025-02-01',
      accountId: tfsa.id,
    })

    // Emma's account + trade.
    setActiveProfileId(emma.id)
    const emmaTfsa = createAccount({
      name: "Emma's TFSA",
      kind: 'tfsa',
    })
    createTransaction({
      ticker: 'MSFT',
      kind: 'buy',
      quantity: 3,
      price: 400,
      currency: 'USD',
      occurredAt: '2025-02-15',
      accountId: emmaTfsa.id,
    })

    // From Emma's view: only MSFT visible.
    expect(listTransactions().map((t) => t.ticker)).toEqual(['MSFT'])
    expect(listHoldings().map((h) => h.ticker)).toEqual(['MSFT'])

    // Switch back: only AAPL visible.
    setActiveProfileId(1)
    expect(listTransactions().map((t) => t.ticker)).toEqual(['AAPL'])
    expect(listHoldings().map((h) => h.ticker)).toEqual(['AAPL'])
  })

  it('NULL-account dividends only surface in the default profile', () => {
    const emma = createProfile({ name: 'Emma' })

    createDividend({
      ticker: 'AAPL',
      amount: 4.5,
      currency: 'USD',
      paidAt: '2025-03-15',
    })

    setActiveProfileId(1)
    expect(listDividends()).toHaveLength(1)

    setActiveProfileId(emma.id)
    expect(listDividends()).toHaveLength(0)

    setActiveProfileId(1)
    expect(listDividends()).toHaveLength(1)
  })

  it('listProfiles returns every profile regardless of active scope', () => {
    createProfile({ name: 'Emma' })
    createProfile({ name: 'Conjoint' })
    expect(listProfiles()).toHaveLength(3) // seeded + 2 created
  })
})
