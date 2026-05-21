import { getSetting, setSetting } from '../db/repo/settings'

export const SETTING_KEYS = {
  finnhubKey: 'api.finnhubKey',
  twelvedataKey: 'api.twelvedataKey',
  displayCurrency: 'app.displayCurrency',
  locale: 'app.locale',
  theme: 'app.theme',
  refreshIntervalSec: 'app.refreshIntervalSec',
  lastSnapshotDate: 'app.lastSnapshotDate',
} as const

export const DEFAULTS = {
  displayCurrency: 'CAD',
  locale: 'fr',
  theme: 'dark',
  refreshIntervalSec: '300',
} as const

export function getApiKey(provider: 'finnhub' | 'twelvedata'): string | null {
  const stored =
    provider === 'finnhub'
      ? getSetting(SETTING_KEYS.finnhubKey)
      : getSetting(SETTING_KEYS.twelvedataKey)
  if (stored && stored.trim()) return stored.trim()
  const envKey =
    provider === 'finnhub' ? process.env.FINNHUB_API_KEY : process.env.TWELVEDATA_API_KEY
  return envKey?.trim() || null
}

export function setApiKey(provider: 'finnhub' | 'twelvedata', value: string): void {
  const key =
    provider === 'finnhub' ? SETTING_KEYS.finnhubKey : SETTING_KEYS.twelvedataKey
  setSetting(key, value.trim())
}

// Copy env-var API keys into SQLite on first boot if the user has dropped
// values in `.env.local` but never saved through the Settings UI. After
// this, SQLite is the source of truth and the user never has to think
// about env vars again. Idempotent: skips keys that are already stored.
export function bootstrapApiKeysFromEnv(): { seeded: ('finnhub' | 'twelvedata')[] } {
  const seeded: ('finnhub' | 'twelvedata')[] = []
  const finnhubStored = getSetting(SETTING_KEYS.finnhubKey)
  if ((!finnhubStored || !finnhubStored.trim()) && process.env.FINNHUB_API_KEY) {
    setApiKey('finnhub', process.env.FINNHUB_API_KEY)
    seeded.push('finnhub')
  }
  const twelvedataStored = getSetting(SETTING_KEYS.twelvedataKey)
  if (
    (!twelvedataStored || !twelvedataStored.trim()) &&
    process.env.TWELVEDATA_API_KEY
  ) {
    setApiKey('twelvedata', process.env.TWELVEDATA_API_KEY)
    seeded.push('twelvedata')
  }
  return { seeded }
}

export function getTargetForSector(sectorCode: string): number | null {
  const raw = getSetting(`targets.${sectorCode}`)
  if (!raw) return null
  const v = Number(raw)
  return Number.isFinite(v) ? v : null
}

export function setTargetForSector(sectorCode: string, percent: number): void {
  setSetting(`targets.${sectorCode}`, String(percent))
}
