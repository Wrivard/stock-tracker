import { listHoldings } from '../db/repo/holdings'
import { listSectors } from '../db/repo/sectors'
import { getCachedEtfDetails, getCachedQuote } from './market-api'
import { readRaw } from './cache'
import { getApiKey } from './settings-keys'
import { getSetting } from '../db/repo/settings'
import { DEFAULTS, SETTING_KEYS } from './settings-keys'
import type { Currency } from '../db/types'
import type { FxRate, Quote } from './types'

export interface PortfolioPosition {
  ticker: string
  name: string | null
  sectorId: number | null
  sectorCode: string | null
  sectorLabelFr: string | null
  sectorLabelEn: string | null
  currency: Currency
  quantity: number
  avgCost: number
  currentPrice: number | null
  previousClose: number | null
  change: number | null
  changePercent: number | null
  quoteFetchedAt: number | null
  quoteStale: boolean
  marketValue: number
  costBasis: number
  pnl: number
  pnlPct: number
  dayPnl: number
  weight: number
}

export interface PortfolioSectorAllocation {
  code: string
  labelFr: string
  labelEn: string
  color: string | null
  value: number
  percent: number
  // Portion of `value` that came from ETF look-through (vs. direct
  // equity holdings). Lets the UI annotate "30% Tech (12% via ETF)".
  etfValue: number
}

export interface PortfolioOverview {
  displayCurrency: Currency
  totalValue: number
  totalCost: number
  totalPnl: number
  totalPnlPct: number
  dayChange: number
  dayChangePct: number
  // sectors uses look-through: each ETF position's value is split
  // across its constituent sectors. When an ETF has no cached
  // composition, its full value falls back to the "etf" bucket.
  sectors: PortfolioSectorAllocation[]
  // sectorsRaw is the "naive" view: every ETF stays in the "etf"
  // bucket. Kept around so the UI can offer a toggle.
  sectorsRaw: PortfolioSectorAllocation[]
  positions: PortfolioPosition[]
  fxUsdToCad: number
  fxFetchedAt: number | null
  fxStale: boolean
  missingApiKey: { finnhub: boolean; twelvedata: boolean }
  oldestQuoteAge: number | null
  anyStale: boolean
  // List of ETF symbols whose composition was used in the look-through;
  // empty means look-through was a no-op (no ETFs / no cached data).
  lookThroughApplied: string[]
}

function readDisplayCurrency(): Currency {
  const raw = getSetting(SETTING_KEYS.displayCurrency)
  return raw === 'USD' ? 'USD' : (DEFAULTS.displayCurrency as Currency)
}

export function getPortfolioOverview(
  displayCurrency?: Currency,
): PortfolioOverview {
  const display = displayCurrency ?? readDisplayCurrency()

  // FX rate from cache only. If absent (first run), assume 1:1 and flag stale.
  const fxCache = readRaw<FxRate>(`fx:USD->CAD`)
  const usdToCad = fxCache?.data.rate ?? 1
  const fxStale = !fxCache || fxCache.stale
  const fxFetchedAt: number | null = fxCache?.fetchedAt ?? null

  // Helper: convert a native value (in `nativeCur`) to the chosen display
  // currency. We anchor everything on USD<->CAD via the cached FX rate.
  function toDisplay(value: number, nativeCur: Currency): number {
    if (nativeCur === display) return value
    if (nativeCur === 'USD' && display === 'CAD') return value * usdToCad
    if (nativeCur === 'CAD' && display === 'USD') return value / usdToCad
    return value
  }

  const sectorsAll = listSectors()
  const sectorMap = new Map(sectorsAll.map((s) => [s.code, s]))

  const holdings = listHoldings()
  const positions: PortfolioPosition[] = []
  // Two parallel ledgers: "raw" keeps ETFs in their own bucket, "look-
  // through" splits ETF value across the constituent sector weightings.
  const sectorTotalsRaw = new Map<string, number>()
  const sectorTotalsLookThrough = new Map<string, number>()
  const sectorEtfContribution = new Map<string, number>()
  const lookThroughApplied: string[] = []
  let totalValue = 0
  let totalCost = 0
  let dayChange = 0
  let oldestQuoteAge: number | null = null
  let anyStale = false

  for (const h of holdings) {
    const quoteCache = getCachedQuote(h.ticker)
    const quote: Quote | null = quoteCache?.data ?? null
    if (quoteCache) {
      anyStale = anyStale || quoteCache.stale
      const age = Date.now() - quoteCache.fetchedAt
      oldestQuoteAge = oldestQuoteAge === null ? age : Math.max(oldestQuoteAge, age)
    } else {
      anyStale = true
    }

    const price = quote?.price ?? h.avgCost
    const valueNative = h.quantity * price
    const costNative = h.quantity * h.avgCost
    const marketValue = toDisplay(valueNative, h.currency)
    const costBasis = toDisplay(costNative, h.currency)
    const pnl = marketValue - costBasis
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0
    const dayPnlNative = h.quantity * (quote?.change ?? 0)
    const dayPnl = toDisplay(dayPnlNative, h.currency)

    totalValue += marketValue
    totalCost += costBasis
    dayChange += dayPnl

    const sectorCode = h.sectorCode ?? 'other'
    sectorTotalsRaw.set(
      sectorCode,
      (sectorTotalsRaw.get(sectorCode) ?? 0) + marketValue,
    )

    // Look-through: if this position is an ETF and we have a cached
    // sector breakdown, distribute marketValue across the underlying
    // sectors. Otherwise, fall back to the naive bucket.
    const isEtf = sectorCode === 'etf'
    let lookThroughApplied_ = false
    if (isEtf) {
      const cached = getCachedEtfDetails(h.ticker)
      const details = cached?.data ?? null
      const weightingSum = details
        ? Object.values(details.sectorWeightings).reduce((a, b) => a + b, 0)
        : 0
      if (details && weightingSum > 0) {
        for (const [code, weight] of Object.entries(details.sectorWeightings)) {
          const portion = marketValue * weight
          sectorTotalsLookThrough.set(
            code,
            (sectorTotalsLookThrough.get(code) ?? 0) + portion,
          )
          sectorEtfContribution.set(
            code,
            (sectorEtfContribution.get(code) ?? 0) + portion,
          )
        }
        // Any unclassified slice (Yahoo doesn't categorize cash, etc.)
        // is bucketed as "other" so the totals still sum to marketValue.
        const unclassified = marketValue * (1 - weightingSum)
        if (unclassified > 0.01) {
          sectorTotalsLookThrough.set(
            'other',
            (sectorTotalsLookThrough.get('other') ?? 0) + unclassified,
          )
        }
        lookThroughApplied.push(h.ticker)
        lookThroughApplied_ = true
      }
    }
    if (!lookThroughApplied_) {
      sectorTotalsLookThrough.set(
        sectorCode,
        (sectorTotalsLookThrough.get(sectorCode) ?? 0) + marketValue,
      )
    }

    positions.push({
      ticker: h.ticker,
      name: h.name,
      sectorId: h.sectorId,
      sectorCode: h.sectorCode,
      sectorLabelFr: h.sectorLabelFr,
      sectorLabelEn: h.sectorLabelEn,
      currency: h.currency,
      quantity: h.quantity,
      avgCost: h.avgCost,
      currentPrice: quote?.price ?? null,
      previousClose: quote?.previousClose ?? null,
      change: quote?.change ?? null,
      changePercent: quote?.changePercent ?? null,
      quoteFetchedAt: quoteCache?.fetchedAt ?? null,
      quoteStale: quoteCache?.stale ?? true,
      marketValue,
      costBasis,
      pnl,
      pnlPct,
      dayPnl,
      weight: 0,
    })
  }

  // Compute weights now that we have totalValue.
  for (const p of positions) {
    p.weight = totalValue > 0 ? (p.marketValue / totalValue) * 100 : 0
  }
  positions.sort((a, b) => b.marketValue - a.marketValue)

  function buildAllocation(
    totals: Map<string, number>,
    etfContribution: Map<string, number>,
  ): PortfolioSectorAllocation[] {
    const out: PortfolioSectorAllocation[] = []
    for (const [code, value] of totals.entries()) {
      const meta = sectorMap.get(code)
      out.push({
        code,
        labelFr: meta?.labelFr ?? code,
        labelEn: meta?.labelEn ?? code,
        color: meta?.color ?? null,
        value,
        percent: totalValue > 0 ? (value / totalValue) * 100 : 0,
        etfValue: etfContribution.get(code) ?? 0,
      })
    }
    out.sort((a, b) => b.value - a.value)
    return out
  }
  const sectors = buildAllocation(sectorTotalsLookThrough, sectorEtfContribution)
  const sectorsRaw = buildAllocation(sectorTotalsRaw, new Map())

  const totalPnl = totalValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
  const dayChangePct = totalValue > 0 ? (dayChange / totalValue) * 100 : 0

  return {
    displayCurrency: display,
    totalValue,
    totalCost,
    totalPnl,
    totalPnlPct,
    dayChange,
    dayChangePct,
    sectors,
    sectorsRaw,
    lookThroughApplied,
    positions,
    fxUsdToCad: usdToCad,
    fxFetchedAt,
    fxStale,
    missingApiKey: {
      finnhub: !getApiKey('finnhub'),
      twelvedata: !getApiKey('twelvedata'),
    },
    oldestQuoteAge,
    anyStale,
  }
}
