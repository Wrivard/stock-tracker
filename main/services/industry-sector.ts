// Maps Finnhub's `finnhubIndustry` (free-form string) to one of our sector
// codes. The mapping is intentionally permissive (substring match on
// lowercase) so new Finnhub industry strings keep working.
const RULES: Array<{ match: RegExp; sector: string }> = [
  { match: /tech|software|hardware|semiconductor|electronic|internet|computer/, sector: 'tech' },
  { match: /health|pharma|biotech|medical|hospital|drug|life science/, sector: 'health' },
  { match: /bank|financ|insur|capital market|asset manag|investment/, sector: 'finance' },
  { match: /energy|oil|gas|petroleum|coal|pipeline/, sector: 'energy' },
  { match: /consumer|retail|food|beverag|tobacco|apparel|household|auto|leisure/, sector: 'consumer' },
  { match: /industrial|machinery|aerospace|defense|construct|transport|logistic|airline|rail/, sector: 'industrial' },
  { match: /material|chemical|metal|mining|paper|forest|steel/, sector: 'materials' },
  { match: /utilit|electric power|water/, sector: 'utilities' },
  { match: /telecom|media|communicat|entertainment|publish/, sector: 'telecom' },
  { match: /real estate|reit|property/, sector: 'real_estate' },
]

export function industryToSectorCode(industry: string | null | undefined): string {
  if (!industry) return 'other'
  const lc = industry.toLowerCase()
  for (const r of RULES) if (r.match.test(lc)) return r.sector
  return 'other'
}
