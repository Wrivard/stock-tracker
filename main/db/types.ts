export type Currency = 'USD' | 'CAD'
export type TransactionKind = 'buy' | 'sell'

export interface Sector {
  id: number
  code: string
  labelFr: string
  labelEn: string
  color: string | null
}

export interface Ticker {
  symbol: string
  name: string | null
  currency: Currency
  exchange: string | null
  sectorId: number | null
  sectorOverride: boolean
  finnhubIndustry: string | null
  updatedAt: number
}

export interface TickerInput {
  symbol: string
  name?: string | null
  currency?: Currency
  exchange?: string | null
  sectorId?: number | null
  sectorOverride?: boolean
}

export interface Profile {
  id: number
  name: string
  color: string | null
  createdAt: number
  updatedAt: number
}

export interface ProfileInput {
  name: string
  color?: string | null
}

export type AccountKind =
  | 'tfsa'
  | 'rrsp'
  | 'fhsa'
  | 'lira'
  | 'resp'
  | 'taxable'
  | 'other'

export interface Account {
  id: number
  name: string
  kind: AccountKind
  brokerAccountNumber: string | null
  defaultCurrency: Currency | null
  profileId: number
  // Yearly contribution cap in CAD (e.g. 8000 for a FHSA). null = no
  // limit tracked. Used to compute remaining contribution room from
  // gross buy transactions per calendar year.
  annualContributionLimit: number | null
  createdAt: number
  updatedAt: number
}

export interface AccountInput {
  name: string
  kind: AccountKind
  brokerAccountNumber?: string | null
  defaultCurrency?: Currency | null
  profileId?: number
  annualContributionLimit?: number | null
}

export interface Transaction {
  id: number
  ticker: string
  kind: TransactionKind
  quantity: number
  price: number
  currency: Currency
  fees: number
  notes: string | null
  occurredAt: string
  // null = "uncategorized" — existing transactions before the v3
  // migration land here, as do manually-entered transactions without
  // an explicit account choice.
  accountId: number | null
  // Stable natural-key for de-dup on broker re-import. null for
  // manually-entered transactions.
  externalId: string | null
  createdAt: number
  updatedAt: number
}

export interface TransactionInput {
  ticker: string
  kind: TransactionKind
  quantity: number
  price: number
  currency: Currency
  fees?: number
  notes?: string | null
  occurredAt: string
  accountId?: number | null
  externalId?: string | null
}

export interface Holding {
  ticker: string
  name: string | null
  currency: Currency
  sectorId: number | null
  sectorCode: string | null
  sectorLabelFr: string | null
  sectorLabelEn: string | null
  quantity: number
  avgCost: number
  totalCost: number
  buyCount: number
  sellCount: number
}

export interface Setting {
  key: string
  value: string
  updatedAt: number
}

export type DividendKind = 'dividend' | 'interest' | 'distribution'
export type DividendSource = 'manual' | 'questrade'

export interface Dividend {
  id: number
  ticker: string | null
  accountId: number | null
  amount: number
  currency: Currency
  paidAt: string  // yyyy-mm-dd
  kind: DividendKind
  notes: string | null
  source: DividendSource
  externalId: string | null
  createdAt: number
  updatedAt: number
}

export interface DividendInput {
  ticker?: string | null
  accountId?: number | null
  amount: number
  currency: Currency
  paidAt: string
  kind?: DividendKind
  notes?: string | null
  source?: DividendSource
  externalId?: string | null
}
