import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc/channels'
import type {
  Holding,
  Sector,
  Setting,
  Ticker,
  TickerInput,
  Transaction,
  TransactionInput,
} from './db/types'

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
    list: (filter?: { ticker?: string }) =>
      ipcRenderer.invoke(IPC.transactions.list, filter) as Promise<Transaction[]>,
    create: (input: TransactionInput) =>
      ipcRenderer.invoke(IPC.transactions.create, input) as Promise<Transaction>,
    update: (id: number, input: Partial<TransactionInput>) =>
      ipcRenderer.invoke(IPC.transactions.update, id, input) as Promise<
        Transaction | null
      >,
    delete: (id: number) =>
      ipcRenderer.invoke(IPC.transactions.delete, id) as Promise<void>,
  },
  holdings: {
    list: (includeEmpty?: boolean) =>
      ipcRenderer.invoke(IPC.holdings.list, includeEmpty) as Promise<Holding[]>,
  },
  settings: {
    get: (key: string) =>
      ipcRenderer.invoke(IPC.settings.get, key) as Promise<string | null>,
    set: (key: string, value: string) =>
      ipcRenderer.invoke(IPC.settings.set, key, value) as Promise<void>,
    list: () => ipcRenderer.invoke(IPC.settings.list) as Promise<Setting[]>,
    delete: (key: string) =>
      ipcRenderer.invoke(IPC.settings.delete, key) as Promise<void>,
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
