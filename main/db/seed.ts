import type Database from 'better-sqlite3'

const DEFAULT_SECTORS = [
  { code: 'tech', labelFr: 'Technologie', labelEn: 'Technology', color: '#3b82f6' },
  { code: 'health', labelFr: 'Sante', labelEn: 'Healthcare', color: '#10b981' },
  { code: 'finance', labelFr: 'Finance', labelEn: 'Financial', color: '#f59e0b' },
  { code: 'energy', labelFr: 'Energie', labelEn: 'Energy', color: '#ef4444' },
  { code: 'consumer', labelFr: 'Consommation', labelEn: 'Consumer', color: '#8b5cf6' },
  { code: 'industrial', labelFr: 'Industriel', labelEn: 'Industrials', color: '#6366f1' },
  { code: 'materials', labelFr: 'Materiaux', labelEn: 'Materials', color: '#a855f7' },
  { code: 'utilities', labelFr: 'Services publics', labelEn: 'Utilities', color: '#14b8a6' },
  { code: 'telecom', labelFr: 'Telecommunications', labelEn: 'Communication', color: '#ec4899' },
  { code: 'real_estate', labelFr: 'Immobilier', labelEn: 'Real Estate', color: '#f97316' },
  { code: 'other', labelFr: 'Autre', labelEn: 'Other', color: '#737373' },
]

export function seedSectors(db: Database.Database): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO sectors (code, label_fr, label_en, color)
    VALUES (@code, @labelFr, @labelEn, @color)
  `)
  db.transaction(() => {
    for (const sector of DEFAULT_SECTORS) insert.run(sector)
  })()
}
