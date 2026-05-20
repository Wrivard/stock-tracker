import { getDb } from '../connection'
import type { Setting } from '../types'

interface SettingRow {
  key: string
  value: string
  updated_at: number
}

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, Date.now())
}

export function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function listSettings(): Setting[] {
  const rows = getDb()
    .prepare('SELECT * FROM settings ORDER BY key')
    .all() as SettingRow[]
  return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at }))
}
