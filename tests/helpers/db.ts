import Database from 'better-sqlite3'

import { runMigrations } from '../../main/db/migrations'
import { seedSectors } from '../../main/db/seed'
import { setDb } from '../../main/db/connection'

// Build a fresh in-memory SQLite with our schema + seeded sectors and wire
// it as the global db used by the repos. Returns the raw Database so the
// test can close it on teardown.
export function makeTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = MEMORY')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedSectors(db)
  setDb(db)
  return db
}

export function closeTestDb(db: Database.Database | undefined): void {
  setDb(null)
  if (db) db.close()
}
