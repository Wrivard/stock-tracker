import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

import { IPC } from './channels'
import * as holdingsRepo from '../db/repo/holdings'
import * as sectorsRepo from '../db/repo/sectors'
import * as settingsRepo from '../db/repo/settings'
import * as tickersRepo from '../db/repo/tickers'
import * as txRepo from '../db/repo/transactions'

const Currency = z.enum(['USD', 'CAD'])
const Kind = z.enum(['buy', 'sell'])

const TickerInputSchema = z.object({
  symbol: z.string().min(1).max(20),
  name: z.string().max(200).nullable().optional(),
  currency: Currency.optional(),
  exchange: z.string().max(50).nullable().optional(),
  sectorId: z.number().int().nullable().optional(),
  sectorOverride: z.boolean().optional(),
})

const TransactionInputSchema = z.object({
  ticker: z.string().min(1).max(20),
  kind: Kind,
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  currency: Currency,
  fees: z.number().nonnegative().optional(),
  notes: z.string().max(500).nullable().optional(),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const TxFilterSchema = z.object({ ticker: z.string().optional() }).optional()

type AnyHandler = (...args: never[]) => unknown

function wrap<T extends AnyHandler>(fn: T) {
  return async (_event: IpcMainInvokeEvent, ...args: Parameters<T>) => {
    try {
      return await (fn as (...a: Parameters<T>) => ReturnType<T>)(...args)
    } catch (err) {
      console.error('[ipc]', err)
      throw err
    }
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.sectors.list, wrap(() => sectorsRepo.listSectors()))

  ipcMain.handle(IPC.tickers.list, wrap(() => tickersRepo.listTickers()))
  ipcMain.handle(
    IPC.tickers.get,
    wrap((symbol: string) => tickersRepo.getTickerBySymbol(symbol)),
  )
  ipcMain.handle(
    IPC.tickers.upsert,
    wrap((input: unknown) => tickersRepo.upsertTicker(TickerInputSchema.parse(input))),
  )
  ipcMain.handle(
    IPC.tickers.delete,
    wrap((symbol: string) => tickersRepo.deleteTicker(symbol)),
  )
  ipcMain.handle(
    IPC.tickers.setSector,
    wrap((symbol: string, sectorId: number | null, override: boolean) =>
      tickersRepo.setTickerSector(symbol, sectorId, override),
    ),
  )

  ipcMain.handle(
    IPC.transactions.list,
    wrap((filter: unknown) => txRepo.listTransactions(TxFilterSchema.parse(filter))),
  )
  ipcMain.handle(
    IPC.transactions.create,
    wrap((input: unknown) => txRepo.createTransaction(TransactionInputSchema.parse(input))),
  )
  ipcMain.handle(
    IPC.transactions.update,
    wrap((id: number, input: unknown) =>
      txRepo.updateTransaction(id, TransactionInputSchema.partial().parse(input)),
    ),
  )
  ipcMain.handle(
    IPC.transactions.delete,
    wrap((id: number) => txRepo.deleteTransaction(id)),
  )

  ipcMain.handle(
    IPC.holdings.list,
    wrap((includeEmpty?: boolean) => holdingsRepo.listHoldings(includeEmpty)),
  )

  ipcMain.handle(IPC.settings.get, wrap((key: string) => settingsRepo.getSetting(key)))
  ipcMain.handle(
    IPC.settings.set,
    wrap((key: string, value: string) => settingsRepo.setSetting(key, value)),
  )
  ipcMain.handle(IPC.settings.delete, wrap((key: string) => settingsRepo.deleteSetting(key)))
  ipcMain.handle(IPC.settings.list, wrap(() => settingsRepo.listSettings()))
}
