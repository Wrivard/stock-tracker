import { getDb } from '../db/connection'
import { listHoldings } from '../db/repo/holdings'
import { getSetting, setSetting } from '../db/repo/settings'
import { SETTING_KEYS } from './settings-keys'
import { getFxRate, getQuote } from './market-api'
import type { Currency } from '../db/types'

export interface PortfolioSnapshot {
  date: string
  totalValueCad: number
  totalValueUsd: number | null
  perSector: Record<string, number>
  perHolding: Record<
    string,
    {
      qty: number
      price: number
      currency: Currency
      valueCad: number
      sectorCode: string | null
    }
  >
  createdAt: number
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface SnapshotRow {
  date: string
  total_value_cad: number
  total_value_usd: number | null
  per_sector_json: string | null
  per_holding_json: string | null
  created_at: number
}

const rowToSnapshot = (r: SnapshotRow): PortfolioSnapshot => ({
  date: r.date,
  totalValueCad: r.total_value_cad,
  totalValueUsd: r.total_value_usd,
  perSector: r.per_sector_json ? (JSON.parse(r.per_sector_json) as Record<string, number>) : {},
  perHolding: r.per_holding_json
    ? (JSON.parse(r.per_holding_json) as PortfolioSnapshot['perHolding'])
    : {},
  createdAt: r.created_at,
})

export async function captureDailySnapshot(): Promise<PortfolioSnapshot | null> {
  const holdings = listHoldings()
  if (holdings.length === 0) {
    setSetting(SETTING_KEYS.lastSnapshotDate, todayIso())
    return null
  }

  // FX: pull USD->CAD once if any USD holdings are present.
  let usdToCad = 1
  const hasUsd = holdings.some((h) => h.currency === 'USD')
  if (hasUsd) {
    try {
      const fx = await getFxRate('USD', 'CAD')
      usdToCad = fx.data.rate
    } catch {
      // Without FX we can still snapshot but USD holdings will be approximate.
      usdToCad = 1
    }
  }

  let totalCad = 0
  let totalUsd = 0
  const perSector: Record<string, number> = {}
  const perHolding: PortfolioSnapshot['perHolding'] = {}

  for (const h of holdings) {
    let price = h.avgCost
    try {
      const q = await getQuote(h.ticker)
      price = q.data.price
    } catch {
      // Fall back to average cost if quote unavailable.
    }
    const valueNative = h.quantity * price
    const valueCad =
      h.currency === 'CAD' ? valueNative : valueNative * usdToCad
    const valueUsd =
      h.currency === 'USD' ? valueNative : valueNative / usdToCad

    totalCad += valueCad
    totalUsd += valueUsd

    perHolding[h.ticker] = {
      qty: h.quantity,
      price,
      currency: h.currency,
      valueCad,
      sectorCode: h.sectorCode,
    }
    const code = h.sectorCode ?? 'other'
    perSector[code] = (perSector[code] ?? 0) + valueCad
  }

  const date = todayIso()
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO portfolio_snapshots
         (date, total_value_cad, total_value_usd, per_sector_json, per_holding_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         total_value_cad  = excluded.total_value_cad,
         total_value_usd  = excluded.total_value_usd,
         per_sector_json  = excluded.per_sector_json,
         per_holding_json = excluded.per_holding_json,
         created_at       = excluded.created_at`,
    )
    .run(
      date,
      totalCad,
      totalUsd,
      JSON.stringify(perSector),
      JSON.stringify(perHolding),
      now,
    )

  setSetting(SETTING_KEYS.lastSnapshotDate, date)

  return {
    date,
    totalValueCad: totalCad,
    totalValueUsd: totalUsd,
    perSector,
    perHolding,
    createdAt: now,
  }
}

export async function maybeCaptureDailySnapshot(): Promise<PortfolioSnapshot | null> {
  const last = getSetting(SETTING_KEYS.lastSnapshotDate)
  if (last === todayIso()) return null
  return captureDailySnapshot()
}

export function listSnapshots(): PortfolioSnapshot[] {
  const rows = getDb()
    .prepare('SELECT * FROM portfolio_snapshots ORDER BY date ASC')
    .all() as SnapshotRow[]
  return rows.map(rowToSnapshot)
}

export function getLatestSnapshot(): PortfolioSnapshot | null {
  const row = getDb()
    .prepare('SELECT * FROM portfolio_snapshots ORDER BY date DESC LIMIT 1')
    .get() as SnapshotRow | undefined
  return row ? rowToSnapshot(row) : null
}
