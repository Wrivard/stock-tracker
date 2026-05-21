import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
} from 'electron'
import electronUpdaterPkg from 'electron-updater'
import { z } from 'zod'

const { autoUpdater } = electronUpdaterPkg

import { IPC } from './channels'
import * as holdingsRepo from '../db/repo/holdings'
import * as sectorsRepo from '../db/repo/sectors'
import * as settingsRepo from '../db/repo/settings'
import * as tickersRepo from '../db/repo/tickers'
import * as txRepo from '../db/repo/transactions'
import * as market from '../services/market-api'
import * as portfolio from '../services/portfolio'
import * as snapshots from '../services/snapshots'
import * as backup from '../services/backup'
import { summarizePortfolioWeek } from '../services/ai/recap'
import { getApiKey, setApiKey } from '../services/settings-keys'

const Currency = z.enum(['USD', 'CAD'])
const Kind = z.enum(['buy', 'sell'])
const Period = z.enum(['1M', '3M', '6M', '1Y', 'ALL'])
const ApiProvider = z.enum(['finnhub', 'twelvedata', 'openai'])
const Locale = z.enum(['fr', 'en'])

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
const BypassSchema = z.object({ bypass: z.boolean().optional() }).optional()

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
  ipcMain.handle(
    IPC.settings.apiKeyStatus,
    wrap(() => {
      // Surface the last 4 characters of a stored key as a "fingerprint"
      // the Settings UI can show ("configured · …86tg"). The full key
      // never leaves the main process — we deliberately do NOT expose a
      // getter that returns the raw value to the renderer.
      const finnhub = getApiKey('finnhub')
      const twelvedata = getApiKey('twelvedata')
      const openai = getApiKey('openai')
      const tail = (s: string | null) => (s && s.length >= 4 ? s.slice(-4) : null)
      return {
        finnhub: !!finnhub,
        twelvedata: !!twelvedata,
        openai: !!openai,
        finnhubTail: tail(finnhub),
        twelvedataTail: tail(twelvedata),
        openaiTail: tail(openai),
      }
    }),
  )
  ipcMain.handle(
    IPC.settings.setApiKey,
    wrap((provider: unknown, value: string) => {
      setApiKey(ApiProvider.parse(provider), value)
    }),
  )

  ipcMain.handle(
    IPC.market.quote,
    wrap((symbol: string, opts: unknown) =>
      market.getQuote(symbol, BypassSchema.parse(opts)),
    ),
  )
  ipcMain.handle(
    IPC.market.profile,
    wrap((symbol: string, opts: unknown) =>
      market.getProfile(symbol, BypassSchema.parse(opts)),
    ),
  )
  ipcMain.handle(
    IPC.market.news,
    wrap((symbol: string, opts: unknown) =>
      market.getNews(symbol, BypassSchema.parse(opts)),
    ),
  )
  ipcMain.handle(
    IPC.market.history,
    wrap((symbol: string, period: unknown) =>
      market.getHistory(symbol, Period.parse(period ?? '1Y')),
    ),
  )
  ipcMain.handle(
    IPC.market.fxRate,
    wrap((from: unknown, to: unknown) =>
      market.getFxRate(Currency.parse(from), Currency.parse(to)),
    ),
  )
  ipcMain.handle(
    IPC.market.refreshTicker,
    wrap((symbol: string, opts: unknown) =>
      market.refreshTicker(symbol, BypassSchema.parse(opts)),
    ),
  )
  ipcMain.handle(
    IPC.market.refreshAll,
    wrap((opts: unknown) => market.refreshAll(BypassSchema.parse(opts))),
  )
  ipcMain.handle(IPC.market.status, wrap(() => market.getCacheStatus()))
  ipcMain.handle(
    IPC.market.invalidateQuotes,
    wrap(() => market.invalidateAllQuotes()),
  )
  ipcMain.handle(
    IPC.market.portfolioNews,
    wrap((opts: unknown) => {
      const parsed = z
        .object({ cachedOnly: z.boolean().optional() })
        .optional()
        .parse(opts)
      return market.getPortfolioNews(parsed)
    }),
  )
  ipcMain.handle(
    IPC.market.search,
    wrap((query: unknown) => {
      const q = z.string().max(50).parse(query)
      return market.searchTickers(q)
    }),
  )
  ipcMain.handle(
    IPC.market.etfDetails,
    wrap((symbol: string, opts: unknown) =>
      market.getEtfDetails(symbol, BypassSchema.parse(opts)),
    ),
  )

  ipcMain.handle(IPC.snapshots.list, wrap(() => snapshots.listSnapshots()))
  ipcMain.handle(IPC.snapshots.capture, wrap(() => snapshots.captureDailySnapshot()))

  ipcMain.handle(
    IPC.portfolio.overview,
    wrap((displayCurrency: unknown) => {
      const cur = Currency.optional().parse(displayCurrency)
      return portfolio.getPortfolioOverview(cur)
    }),
  )

  ipcMain.handle(
    IPC.ai.newsRecap,
    wrap((locale: unknown, days: unknown) => {
      const parsedLocale = Locale.optional().parse(locale) ?? 'fr'
      const parsedDays = z.number().int().min(1).max(30).optional().parse(days) ?? 7
      return summarizePortfolioWeek(parsedLocale, parsedDays)
    }),
  )

  ipcMain.handle(
    IPC.shell.openExternal,
    wrap(async (url: string) => {
      const safe = z.string().url().startsWith('http').parse(url)
      await shell.openExternal(safe)
    }),
  )

  ipcMain.handle(IPC.backup.list, wrap(() => backup.listBackups()))
  ipcMain.handle(IPC.backup.runNow, wrap(() => backup.runDailyBackup()))
  ipcMain.handle(IPC.backup.openFolder, wrap(() => shell.openPath(backup.getBackupDir())))

  ipcMain.handle(IPC.updater.currentVersion, wrap(() => app.getVersion()))
  ipcMain.handle(
    IPC.updater.check,
    wrap(async () => {
      const isProd = process.env.NODE_ENV === 'production'
      if (!isProd) {
        return {
          status: 'dev' as const,
          message: 'Auto-update is disabled in development.',
        }
      }
      try {
        const result = await autoUpdater.checkForUpdatesAndNotify()
        if (!result?.updateInfo) {
          return { status: 'up-to-date' as const }
        }
        return {
          status: 'available' as const,
          version: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate,
        }
      } catch (err) {
        return {
          status: 'error' as const,
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }),
  )
  ipcMain.handle(
    IPC.updater.quitAndInstall,
    wrap(() => {
      try {
        autoUpdater.quitAndInstall()
      } catch (err) {
        console.error('[ipc] quitAndInstall', err)
      }
    }),
  )

  // Save dialog needs the sender's window to be modal — fall back to no
  // window if we can't resolve one (still works, just not modal).
  ipcMain.handle(IPC.backup.exportTo, async (event: IpcMainInvokeEvent) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const defaultName = `portfolio-export-${new Date().toISOString().slice(0, 10)}.sqlite`
      const result = win
        ? await dialog.showSaveDialog(win, {
            defaultPath: defaultName,
            filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }],
          })
        : await dialog.showSaveDialog({
            defaultPath: defaultName,
            filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }],
          })
      if (result.canceled || !result.filePath) return null
      await backup.exportTo(result.filePath)
      return result.filePath
    } catch (err) {
      console.error('[ipc] backup.exportTo', err)
      throw err
    }
  })
}
