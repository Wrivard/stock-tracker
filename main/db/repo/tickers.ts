import { getDb } from '../connection'
import type { Currency, Ticker, TickerInput } from '../types'

interface TickerRow {
  symbol: string
  name: string | null
  currency: string
  exchange: string | null
  sector_id: number | null
  sector_override: number
  finnhub_industry: string | null
  updated_at: number
}

const rowToTicker = (r: TickerRow): Ticker => ({
  symbol: r.symbol,
  name: r.name,
  currency: r.currency as Currency,
  exchange: r.exchange,
  sectorId: r.sector_id,
  sectorOverride: r.sector_override === 1,
  finnhubIndustry: r.finnhub_industry,
  updatedAt: r.updated_at,
})

export function upsertTicker(input: TickerInput): Ticker {
  const symbol = input.symbol.trim().toUpperCase()
  const now = Date.now()

  // currency=null in the staged row means "keep the existing currency on
  // conflict". We only overwrite it when the caller explicitly passes a
  // value. INSERT path needs a default (USD) since the column is NOT
  // NULL — handled by COALESCE in the VALUES too.
  getDb()
    .prepare(
      `INSERT INTO tickers (symbol, name, currency, exchange, sector_id, sector_override, updated_at)
       VALUES (@symbol, @name, COALESCE(@currency, 'USD'), @exchange, @sectorId, @sectorOverride, @updatedAt)
       ON CONFLICT(symbol) DO UPDATE SET
         name            = COALESCE(excluded.name, tickers.name),
         currency        = COALESCE(NULLIF(excluded.currency, ''), tickers.currency),
         exchange        = COALESCE(excluded.exchange, tickers.exchange),
         sector_id       = CASE
                             WHEN excluded.sector_override = 1 THEN excluded.sector_id
                             ELSE COALESCE(excluded.sector_id, tickers.sector_id)
                           END,
         sector_override = CASE
                             WHEN excluded.sector_override = 1 THEN 1
                             ELSE tickers.sector_override
                           END,
         updated_at      = excluded.updated_at`,
    )
    .run({
      symbol,
      name: input.name ?? null,
      currency: input.currency ?? null,
      exchange: input.exchange ?? null,
      sectorId: input.sectorId ?? null,
      sectorOverride: input.sectorOverride ? 1 : 0,
      updatedAt: now,
    })

  return getTickerBySymbol(symbol)!
}

export function getTickerBySymbol(symbol: string): Ticker | null {
  const row = getDb()
    .prepare('SELECT * FROM tickers WHERE symbol = ?')
    .get(symbol.toUpperCase()) as TickerRow | undefined
  return row ? rowToTicker(row) : null
}

export function listTickers(): Ticker[] {
  const rows = getDb().prepare('SELECT * FROM tickers ORDER BY symbol').all() as TickerRow[]
  return rows.map(rowToTicker)
}

export function deleteTicker(symbol: string): void {
  getDb().prepare('DELETE FROM tickers WHERE symbol = ?').run(symbol.toUpperCase())
}

export function setTickerSector(
  symbol: string,
  sectorId: number | null,
  override = true,
): void {
  getDb()
    .prepare(
      `UPDATE tickers
       SET sector_id = ?, sector_override = ?, updated_at = ?
       WHERE symbol = ?`,
    )
    .run(sectorId, override ? 1 : 0, Date.now(), symbol.toUpperCase())
}
