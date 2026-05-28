import { getDb } from '../connection'
import { getActiveProfileId, getDefaultProfileId } from './profiles'
import type { Currency, Holding } from '../types'

interface HoldingRow {
  symbol: string
  name: string | null
  currency: string
  sector_id: number | null
  sector_code: string | null
  sector_label_fr: string | null
  sector_label_en: string | null
  quantity: number
  total_buy_cost: number
  total_buy_qty: number
  buy_count: number | null
  sell_count: number | null
}

// Holdings are derived from transactions, so the profile filter has
// to apply at the tr level INSIDE the join — otherwise we'd be
// summing trades from across all profiles. NULL-account trades are
// scoped to the default profile only (same logic as listTransactions).
// tr.id IS NULL keeps orphan tickers (no transactions yet) visible
// so the user can find them in includeEmpty mode.
const HOLDINGS_QUERY = `
  SELECT
    t.symbol,
    t.name,
    t.currency,
    t.sector_id,
    s.code     AS sector_code,
    s.label_fr AS sector_label_fr,
    s.label_en AS sector_label_en,
    COALESCE(SUM(CASE WHEN tr.kind = 'buy' THEN tr.quantity ELSE -tr.quantity END), 0) AS quantity,
    COALESCE(SUM(CASE WHEN tr.kind = 'buy' THEN tr.quantity * tr.price + tr.fees ELSE 0 END), 0) AS total_buy_cost,
    COALESCE(SUM(CASE WHEN tr.kind = 'buy' THEN tr.quantity ELSE 0 END), 0) AS total_buy_qty,
    SUM(CASE WHEN tr.kind = 'buy'  THEN 1 ELSE 0 END) AS buy_count,
    SUM(CASE WHEN tr.kind = 'sell' THEN 1 ELSE 0 END) AS sell_count
  FROM tickers t
  LEFT JOIN sectors s     ON s.id = t.sector_id
  LEFT JOIN transactions tr ON tr.ticker = t.symbol
  LEFT JOIN accounts a ON a.id = tr.account_id
  WHERE (
    tr.id IS NULL
    OR a.profile_id = ?
    OR (tr.account_id IS NULL AND ? = ?)
  )
  GROUP BY t.symbol
  ORDER BY t.symbol
`

// Cost basis uses weighted average of BUYS only. Sells reduce quantity but
// don't shift the average buy price. Realized P&L (sell price - avg cost at
// time of sell) is intentionally out of scope for v1 — added later.
const rowToHolding = (r: HoldingRow): Holding => {
  const avgCost = r.total_buy_qty > 0 ? r.total_buy_cost / r.total_buy_qty : 0
  return {
    ticker: r.symbol,
    name: r.name,
    currency: r.currency as Currency,
    sectorId: r.sector_id,
    sectorCode: r.sector_code,
    sectorLabelFr: r.sector_label_fr,
    sectorLabelEn: r.sector_label_en,
    quantity: r.quantity,
    avgCost,
    totalCost: r.quantity * avgCost,
    buyCount: r.buy_count ?? 0,
    sellCount: r.sell_count ?? 0,
  }
}

export function listHoldings(includeEmpty = false): Holding[] {
  const activeId = getActiveProfileId()
  const defaultId = getDefaultProfileId()
  const rows = getDb()
    .prepare(HOLDINGS_QUERY)
    .all(activeId, activeId, defaultId) as HoldingRow[]
  const holdings = rows.map(rowToHolding)
  return includeEmpty ? holdings : holdings.filter((h) => h.quantity > 0)
}

export function getHolding(symbol: string): Holding | null {
  return listHoldings(true).find((h) => h.ticker === symbol.toUpperCase()) ?? null
}
