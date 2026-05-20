import { getDb } from '../connection'
import type { Sector } from '../types'

interface SectorRow {
  id: number
  code: string
  label_fr: string
  label_en: string
  color: string | null
}

const rowToSector = (r: SectorRow): Sector => ({
  id: r.id,
  code: r.code,
  labelFr: r.label_fr,
  labelEn: r.label_en,
  color: r.color,
})

export function listSectors(): Sector[] {
  const rows = getDb().prepare('SELECT * FROM sectors ORDER BY id').all() as SectorRow[]
  return rows.map(rowToSector)
}

export function getSectorByCode(code: string): Sector | null {
  const row = getDb()
    .prepare('SELECT * FROM sectors WHERE code = ?')
    .get(code) as SectorRow | undefined
  return row ? rowToSector(row) : null
}
