import { getDb } from '../connection'
import type { Profile, ProfileInput } from '../types'
import { getSetting, setSetting } from './settings'

interface ProfileRow {
  id: number
  name: string
  color: string | null
  created_at: number
  updated_at: number
}

const rowToProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  name: r.name,
  color: r.color,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export function listProfiles(): Profile[] {
  return (
    getDb()
      .prepare('SELECT * FROM profiles ORDER BY id')
      .all() as ProfileRow[]
  ).map(rowToProfile)
}

export function getProfileById(id: number): Profile | null {
  const row = getDb()
    .prepare('SELECT * FROM profiles WHERE id = ?')
    .get(id) as ProfileRow | undefined
  return row ? rowToProfile(row) : null
}

export function createProfile(input: ProfileInput): Profile {
  const now = Date.now()
  const result = getDb()
    .prepare(
      `INSERT INTO profiles (name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.name, input.color ?? null, now, now)
  return getProfileById(result.lastInsertRowid as number)!
}

export function updateProfile(
  id: number,
  input: Partial<ProfileInput>,
): Profile | null {
  const existing = getProfileById(id)
  if (!existing) return null
  const merged = { ...existing, ...input }
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE profiles SET name = ?, color = ?, updated_at = ? WHERE id = ?`,
    )
    .run(merged.name, merged.color, now, id)
  return getProfileById(id)
}

export function deleteProfile(id: number): { deletedProfile: boolean } {
  // SAFETY: never delete the last remaining profile — leave at least
  // one so the app has somewhere to attach accounts.
  const remaining = (
    getDb().prepare('SELECT COUNT(*) as n FROM profiles').get() as { n: number }
  ).n
  if (remaining <= 1) return { deletedProfile: false }
  getDb().prepare('DELETE FROM profiles WHERE id = ?').run(id)
  // If the user just deleted the active profile, fall back to the
  // first remaining one. Otherwise the renderer is stuck pointing at
  // a row that no longer exists.
  const activeRaw = getSetting('app.activeProfileId')
  if (activeRaw && Number(activeRaw) === id) {
    const fallback = (
      getDb().prepare('SELECT id FROM profiles ORDER BY id LIMIT 1').get() as
        | { id: number }
        | undefined
    )?.id
    if (fallback) {
      setSetting('app.activeProfileId', String(fallback))
    }
  }
  return { deletedProfile: true }
}

// Read the currently-active profile id from settings, falling back to
// 1 (the seeded default). Read every time so a profile switch from
// the renderer takes effect on the next query without any in-memory
// sync.
export function getActiveProfileId(): number {
  const raw = getSetting('app.activeProfileId')
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 1
}

export function setActiveProfileId(id: number): void {
  setSetting('app.activeProfileId', String(id))
}
