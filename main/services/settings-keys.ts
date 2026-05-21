import { getSetting, setSetting } from '../db/repo/settings'

export const SETTING_KEYS = {
  finnhubKey: 'api.finnhubKey',
  twelvedataKey: 'api.twelvedataKey',
  openaiKey: 'api.openaiKey',
  displayCurrency: 'app.displayCurrency',
  locale: 'app.locale',
  theme: 'app.theme',
  refreshIntervalSec: 'app.refreshIntervalSec',
  lastSnapshotDate: 'app.lastSnapshotDate',
} as const

export type ApiProvider = 'finnhub' | 'twelvedata' | 'openai'

export const DEFAULTS = {
  displayCurrency: 'CAD',
  locale: 'fr',
  theme: 'dark',
  refreshIntervalSec: '300',
} as const

function settingKeyForProvider(provider: ApiProvider): string {
  switch (provider) {
    case 'finnhub':
      return SETTING_KEYS.finnhubKey
    case 'twelvedata':
      return SETTING_KEYS.twelvedataKey
    case 'openai':
      return SETTING_KEYS.openaiKey
  }
}

function envKeyForProvider(provider: ApiProvider): string | undefined {
  switch (provider) {
    case 'finnhub':
      return process.env.FINNHUB_API_KEY
    case 'twelvedata':
      return process.env.TWELVEDATA_API_KEY
    case 'openai':
      return process.env.OPENAI_API_KEY
  }
}

export function getApiKey(provider: ApiProvider): string | null {
  const stored = getSetting(settingKeyForProvider(provider))
  if (stored && stored.trim()) return stored.trim()
  return envKeyForProvider(provider)?.trim() || null
}

export function setApiKey(provider: ApiProvider, value: string): void {
  setSetting(settingKeyForProvider(provider), value.trim())
}

// Copy env-var API keys into SQLite on first boot if the user has dropped
// values in `.env.local` but never saved through the Settings UI. After
// this, SQLite is the source of truth and the user never has to think
// about env vars again. Idempotent: skips keys that are already stored.
export function bootstrapApiKeysFromEnv(): { seeded: ApiProvider[] } {
  const seeded: ApiProvider[] = []
  for (const provider of ['finnhub', 'twelvedata', 'openai'] as const) {
    const stored = getSetting(settingKeyForProvider(provider))
    const fromEnv = envKeyForProvider(provider)
    if ((!stored || !stored.trim()) && fromEnv && fromEnv.trim()) {
      setApiKey(provider, fromEnv)
      seeded.push(provider)
    }
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
