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
