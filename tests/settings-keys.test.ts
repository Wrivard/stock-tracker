import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'

import { closeTestDb, makeTestDb } from './helpers/db'
import {
  bootstrapApiKeysFromEnv,
  getApiKey,
  setApiKey,
} from '../main/services/settings-keys'

let db: Database.Database

beforeEach(() => {
  db = makeTestDb()
  // Clear env so each test starts clean.
  delete process.env.FINNHUB_API_KEY
  delete process.env.TWELVEDATA_API_KEY
})

afterEach(() => {
  closeTestDb(db)
  delete process.env.FINNHUB_API_KEY
  delete process.env.TWELVEDATA_API_KEY
})

describe('settings-keys.bootstrapApiKeysFromEnv', () => {
  it('does nothing when env is empty and SQLite is empty', () => {
    const { seeded } = bootstrapApiKeysFromEnv()
    expect(seeded).toEqual([])
    expect(getApiKey('finnhub')).toBeNull()
    expect(getApiKey('twelvedata')).toBeNull()
  })

  it('copies env keys into SQLite when SQLite is empty', () => {
    process.env.FINNHUB_API_KEY = 'fhk_abc123'
    process.env.TWELVEDATA_API_KEY = 'tdk_xyz789'
    const { seeded } = bootstrapApiKeysFromEnv()
    expect(seeded.sort()).toEqual(['finnhub', 'twelvedata'])
    expect(getApiKey('finnhub')).toBe('fhk_abc123')
    expect(getApiKey('twelvedata')).toBe('tdk_xyz789')
  })

  it('does not overwrite an existing SQLite key with an env var', () => {
    setApiKey('finnhub', 'fhk_stored_in_db')
    process.env.FINNHUB_API_KEY = 'fhk_from_env'
    const { seeded } = bootstrapApiKeysFromEnv()
    expect(seeded).not.toContain('finnhub')
    expect(getApiKey('finnhub')).toBe('fhk_stored_in_db')
  })

  it('seeds only the missing provider when one is already stored', () => {
    setApiKey('finnhub', 'fhk_stored')
    process.env.FINNHUB_API_KEY = 'fhk_from_env'
    process.env.TWELVEDATA_API_KEY = 'tdk_from_env'
    const { seeded } = bootstrapApiKeysFromEnv()
    expect(seeded).toEqual(['twelvedata'])
    expect(getApiKey('finnhub')).toBe('fhk_stored')
    expect(getApiKey('twelvedata')).toBe('tdk_from_env')
  })

  it('is idempotent on second run', () => {
    process.env.FINNHUB_API_KEY = 'fhk_abc'
    bootstrapApiKeysFromEnv()
    const { seeded } = bootstrapApiKeysFromEnv()
    expect(seeded).toEqual([])
    expect(getApiKey('finnhub')).toBe('fhk_abc')
  })
})
