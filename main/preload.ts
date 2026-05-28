import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc/channels'
import type {
  Account,
  AccountInput,
  Dividend,
  DividendInput,
  Holding,
  Sector,
  Setting,
  Ticker,
  TickerInput,
  Transaction,
  TransactionInput,
  Currency,
} from './db/types'
import type {
  CacheStatus,
  EtfDetails,
  FxRate,
  HistoricalCandle,
  HistoryPeriod,
  NewsItem,
  Profile,
  Quote,
  SymbolSearchResult,
} from './services/types'
import type { CachedEntry } from './services/cache'
import type { AnnotatedNewsItem } from './services/market-api'
import type { PortfolioOverview } from './services/portfolio'
import type {
  PortfolioTimeSeriesResult,
  TimeSeriesPeriod,
} from './services/timeseries'
import type { PortfolioSnapshot } from './services/snapshots'
import type { BackupInfo } from './services/backup'
import type { NewsRecapResult } from './services/ai/recap'
import type {
  ChatMessageInput,
  PortfolioChatResult,
} from './services/ai/portfolio-qa'
import type { ImportSummary } from './services/import-questrade'

type ApiProvider = 'finnhub' | 'twelvedata' | 'openai'

const api = {
  sectors: {
    list: () => ipcRenderer.invoke(IPC.sectors.list) as Promise<Sector[]>,
  },
  tickers: {
    list: () => ipcRenderer.invoke(IPC.tickers.list) as Promise<Ticker[]>,
    get: (symbol: string) =>
      ipcRenderer.invoke(IPC.tickers.get, symbol) as Promise<Ticker | null>,
    upsert: (input: TickerInput) =>
      ipcRenderer.invoke(IPC.tickers.upsert, input) as Promise<Ticker>,
    delete: (symbol: string) =>
      ipcRenderer.invoke(IPC.tickers.delete, symbol) as Promise<void>,
    setSector: (symbol: string, sectorId: number | null, override: boolean) =>
      ipcRenderer.invoke(
        IPC.tickers.setSector,
        symbol,
        sectorId,
        override,
      ) as Promise<void>,
  },
  transactions: {
    list: (filter?: { ticker?: string; accountId?: number | null }) =>
      ipcRenderer.invoke(IPC.transactions.list, filter) as Promise<Transaction[]>,
    create: (input: TransactionInput) =>
      ipcRenderer.invoke(IPC.transactions.create, input) as Promise<Transaction>,
    update: (id: number, input: Partial<TransactionInput>) =>
      ipcRenderer.invoke(IPC.transactions.update, id, input) as Promise<
        Transaction | null
      >,
    delete: (id: number) =>
      ipcRenderer.invoke(IPC.transactions.delete, id) as Promise<void>,
    backfillQuestrade: () =>
      ipcRenderer.invoke(IPC.transactions.backfillQuestrade) as Promise<{
        attached: number
        accountsCreated: number
        alreadyOk: number
        unparseable: number
      }>,
  },
  holdings: {
    list: (includeEmpty?: boolean) =>
      ipcRenderer.invoke(IPC.holdings.list, includeEmpty) as Promise<Holding[]>,
  },
  accounts: {
    list: () =>
      ipcRenderer.invoke(IPC.accounts.list) as Promise<Account[]>,
    create: (input: AccountInput) =>
      ipcRenderer.invoke(IPC.accounts.create, input) as Promise<Account>,
    update: (id: number, input: Partial<AccountInput>) =>
      ipcRenderer.invoke(IPC.accounts.update, id, input) as Promise<Account | null>,
    delete: (id: number) =>
      ipcRenderer.invoke(IPC.accounts.delete, id) as Promise<void>,
  },
  dividends: {
    list: (filter?: {
      ticker?: string | null
      accountId?: number | null
      sinceYyyyMmDd?: string
    }) =>
      ipcRenderer.invoke(IPC.dividends.list, filter) as Promise<Dividend[]>,
    create: (input: DividendInput) =>
      ipcRenderer.invoke(IPC.dividends.create, input) as Promise<Dividend>,
    update: (id: number, input: Partial<DividendInput>) =>
      ipcRenderer.invoke(IPC.dividends.update, id, input) as Promise<
        Dividend | null
      >,
    delete: (id: number) =>
      ipcRenderer.invoke(IPC.dividends.delete, id) as Promise<void>,
  },
  settings: {
    get: (key: string) =>
      ipcRenderer.invoke(IPC.settings.get, key) as Promise<string | null>,
    set: (key: string, value: string) =>
      ipcRenderer.invoke(IPC.settings.set, key, value) as Promise<void>,
    list: () => ipcRenderer.invoke(IPC.settings.list) as Promise<Setting[]>,
    delete: (key: string) =>
      ipcRenderer.invoke(IPC.settings.delete, key) as Promise<void>,
    apiKeyStatus: () =>
      ipcRenderer.invoke(IPC.settings.apiKeyStatus) as Promise<{
        finnhub: boolean
        twelvedata: boolean
        openai: boolean
        finnhubTail: string | null
        twelvedataTail: string | null
        openaiTail: string | null
      }>,
    setApiKey: (provider: ApiProvider, value: string) =>
      ipcRenderer.invoke(IPC.settings.setApiKey, provider, value) as Promise<void>,
  },
  market: {
    quote: (symbol: string, opts?: { bypass?: boolean }) =>
      ipcRenderer.invoke(IPC.market.quote, symbol, opts) as Promise<
        CachedEntry<Quote>
      >,
    profile: (symbol: string, opts?: { bypass?: boolean }) =>
      ipcRenderer.invoke(IPC.market.profile, symbol, opts) as Promise<
        CachedEntry<Profile>
      >,
    news: (symbol: string, opts?: { bypass?: boolean }) =>
      ipcRenderer.invoke(IPC.market.news, symbol, opts) as Promise<
        CachedEntry<NewsItem[]>
      >,
    history: (symbol: string, period: HistoryPeriod) =>
      ipcRenderer.invoke(IPC.market.history, symbol, period) as Promise<
        CachedEntry<HistoricalCandle[]>
      >,
    fxRate: (from: Currency, to: Currency) =>
      ipcRenderer.invoke(IPC.market.fxRate, from, to) as Promise<
        CachedEntry<FxRate>
      >,
    refreshTicker: (symbol: string, opts?: { bypass?: boolean }) =>
      ipcRenderer.invoke(IPC.market.refreshTicker, symbol, opts) as Promise<{
        quote: CachedEntry<Quote> | null
        quoteError: string | null
        profile: Profile | null
        profileError: string | null
      }>,
    refreshAll: (opts?: { bypass?: boolean }) =>
      ipcRenderer.invoke(IPC.market.refreshAll, opts) as Promise<
        Record<
          string,
          {
            quote: CachedEntry<Quote> | null
            quoteError: string | null
            profile: Profile | null
            profileError: string | null
          }
        >
      >,
    status: () => ipcRenderer.invoke(IPC.market.status) as Promise<CacheStatus>,
    invalidateQuotes: () =>
      ipcRenderer.invoke(IPC.market.invalidateQuotes) as Promise<void>,
    portfolioNews: (opts?: { cachedOnly?: boolean }) =>
      ipcRenderer.invoke(IPC.market.portfolioNews, opts) as Promise<{
        items: AnnotatedNewsItem[]
        errors: Record<string, string>
      }>,
    search: (query: string) =>
      ipcRenderer.invoke(IPC.market.search, query) as Promise<
        CachedEntry<SymbolSearchResult[]>
      >,
    etfDetails: (symbol: string, opts?: { bypass?: boolean }) =>
      ipcRenderer.invoke(IPC.market.etfDetails, symbol, opts) as Promise<
        CachedEntry<EtfDetails | null>
      >,
  },
  snapshots: {
    list: () => ipcRenderer.invoke(IPC.snapshots.list) as Promise<PortfolioSnapshot[]>,
    capture: () =>
      ipcRenderer.invoke(IPC.snapshots.capture) as Promise<PortfolioSnapshot | null>,
  },
  portfolio: {
    overview: (displayCurrency?: Currency) =>
      ipcRenderer.invoke(IPC.portfolio.overview, displayCurrency) as Promise<PortfolioOverview>,
    timeSeries: (period: TimeSeriesPeriod, displayCurrency?: Currency) =>
      ipcRenderer.invoke(IPC.portfolio.timeSeries, period, displayCurrency) as Promise<PortfolioTimeSeriesResult>,
  },
  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke(IPC.shell.openExternal, url) as Promise<void>,
  },
  ai: {
    newsRecap: (locale?: 'fr' | 'en', days?: number) =>
      ipcRenderer.invoke(IPC.ai.newsRecap, locale, days) as Promise<NewsRecapResult>,
    portfolioChat: (
      history: ChatMessageInput[],
      locale?: 'fr' | 'en',
    ) =>
      ipcRenderer.invoke(IPC.ai.portfolioChat, history, locale) as Promise<
        PortfolioChatResult
      >,
  },
  importBroker: {
    questrade: () =>
      ipcRenderer.invoke(IPC.importBroker.questrade) as Promise<
        | { canceled: true }
        | { canceled: false; summary: ImportSummary }
      >,
  },
  backup: {
    list: () => ipcRenderer.invoke(IPC.backup.list) as Promise<BackupInfo[]>,
    runNow: () =>
      ipcRenderer.invoke(IPC.backup.runNow) as Promise<{
        created: string | null
        rotated: number
      }>,
    exportTo: () =>
      ipcRenderer.invoke(IPC.backup.exportTo) as Promise<string | null>,
    openFolder: () => ipcRenderer.invoke(IPC.backup.openFolder) as Promise<string>,
  },
  updater: {
    currentVersion: () =>
      ipcRenderer.invoke(IPC.updater.currentVersion) as Promise<string>,
    check: () =>
      ipcRenderer.invoke(IPC.updater.check) as Promise<
        | { status: 'dev'; message: string }
        | { status: 'up-to-date' }
        | { status: 'available'; version: string; releaseDate: string }
        | { status: 'error'; message: string }
      >,
    quitAndInstall: () =>
      ipcRenderer.invoke(IPC.updater.quitAndInstall) as Promise<void>,
    // Subscribe to an "update finished downloading, ready to install"
    // signal pushed by the main process. Returns an unsubscribe fn.
    onDownloaded: (cb: (payload: { version: string }) => void) => {
      const channel = 'updater:downloaded'
      const handler = (_: unknown, payload: { version: string }) => cb(payload)
      ipcRenderer.on(channel, handler)
      return () => {
        ipcRenderer.removeListener(channel, handler)
      }
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
