import path from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { runMigrations } from './migrations'
import { seedSectors } from './seed'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized. Call initDb() first.')
  return db
}

export function initDb(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'portfolio.sqlite')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedSectors(db)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
