import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

import { getDb } from '../db/connection'
import { log } from '../util/logger'

const KEEP_BACKUPS = 7

function backupDir(): string {
  return path.join(app.getPath('userData'), 'backups')
}

function todayIso(): string {
  const d = new Date()
  return (
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` +
    `-${String(d.getDate()).padStart(2, '0')}`
  )
}

export interface BackupInfo {
  fileName: string
  date: string
  sizeBytes: number
  path: string
  createdAt: number
}

// Produces a consistent on-disk copy of the SQLite database using the
// better-sqlite3 backup API (which uses SQLite's BACKUP API under the
// hood — safe with WAL and concurrent writes). One file per day, max
// KEEP_BACKUPS most-recent retained.
export async function runDailyBackup(): Promise<{
  created: string | null
  rotated: number
}> {
  const dir = backupDir()
  fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, `portfolio-${todayIso()}.sqlite`)
  if (fs.existsSync(target)) {
    return { created: null, rotated: 0 }
  }
  await getDb().backup(target)
  const rotated = rotateBackups()
  log('backup created', { target, rotated })
  return { created: target, rotated }
}

function rotateBackups(): number {
  const dir = backupDir()
  if (!fs.existsSync(dir)) return 0
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^portfolio-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
    .sort()
  let removed = 0
  while (files.length > KEEP_BACKUPS) {
    const oldest = files.shift()!
    fs.unlinkSync(path.join(dir, oldest))
    removed++
  }
  return removed
}

export function listBackups(): BackupInfo[] {
  const dir = backupDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => /^portfolio-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
    .map((fileName) => {
      const fullPath = path.join(dir, fileName)
      const stat = fs.statSync(fullPath)
      return {
        fileName,
        date: fileName.replace('portfolio-', '').replace('.sqlite', ''),
        sizeBytes: stat.size,
        path: fullPath,
        createdAt: stat.mtimeMs,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

export async function exportTo(targetPath: string): Promise<void> {
  await getDb().backup(targetPath)
}

export function getBackupDir(): string {
  return backupDir()
}
