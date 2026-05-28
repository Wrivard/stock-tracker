import './services/env'

import path from 'path'
import { Menu, app, dialog, type BrowserWindow } from 'electron'
import serve from 'electron-serve'
import electronUpdaterPkg from 'electron-updater'
import { createWindow } from './helpers/create-window'
import { closeDb, initDb } from './db/connection'
import { registerIpcHandlers } from './ipc/handlers'
import { runDailyBackup } from './services/backup'
import { cleanupExpiredCache, invalidate } from './services/cache'
import { getSetting, setSetting } from './db/repo/settings'
import { bootstrapApiKeysFromEnv } from './services/settings-keys'
import { getFxRate } from './services/market-api'
import { maybeCaptureDailySnapshot } from './services/snapshots'
import { initStartupLog, log } from './util/logger'

const { autoUpdater } = electronUpdaterPkg

const isProd = process.env.NODE_ENV === 'production'

// Force software rendering. Electron 41 + certain Windows GPU driver combos
// have been crashing the GPU process at startup with exit code 0x80000003
// (EXCEPTION_BREAKPOINT) when launched from the installed location. Software
// rendering is plenty fast for charts/tables and avoids the whole class of
// driver-specific failures. Must be called BEFORE app.whenReady().
app.disableHardwareAcceleration()

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

// Catch any unhandled rejection so we don't silently exit. We log it AND
// show a dialog in production so the user knows something went wrong
// instead of just seeing the window flash and disappear.
process.on('uncaughtException', (err) => {
  log('uncaughtException', err)
  if (isProd && app.isReady()) {
    try {
      dialog.showErrorBox(
        'Beta Trading Hub — uncaught exception',
        err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err),
      )
    } catch {
      /* ignore */
    }
  }
})
process.on('unhandledRejection', (reason) => {
  log('unhandledRejection', reason instanceof Error ? reason : { reason: String(reason) })
})

let mainWindow: BrowserWindow | null = null

function bindLocalShortcuts(win: BrowserWindow) {
  // Local in-window shortcut for DevTools. before-input-event runs inside
  // the renderer's input pipeline so it doesn't conflict with global OS
  // shortcuts the way globalShortcut.register('F12', ...) would.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const wantDev =
      input.key === 'F12' ||
      ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')
    if (wantDev) {
      event.preventDefault()
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools()
      } else {
        win.webContents.openDevTools({ mode: 'right' })
      }
    }
  })
}

;(async () => {
  try {
    await app.whenReady()
    initStartupLog()
    log('app ready', { isProd, cwd: process.cwd() })

    initDb()
    log('db initialized')

    // If the user has FINNHUB_API_KEY / TWELVEDATA_API_KEY in .env.local
    // but never saved via Settings, copy them into SQLite once so the app
    // doesn't keep nagging about missing keys.
    const bootstrap = bootstrapApiKeysFromEnv()
    if (bootstrap.seeded.length > 0) {
      log('api keys seeded from env', bootstrap)
    }

    registerIpcHandlers()
    log('ipc handlers registered')

    // Hide the default Electron application menu (File / Edit / View /
    // Window). This app's nav lives entirely in the sidebar + header, so
    // the OS menu was just visual noise. Passing null also disables the
    // default shortcuts (Ctrl+R reload, Ctrl+W close, etc.); the ones we
    // care about (DevTools toggle) are wired explicitly in
    // bindLocalShortcuts below.
    Menu.setApplicationMenu(null)

    mainWindow = createWindow('main', {
      width: 1280,
      height: 840,
      minWidth: 1024,
      minHeight: 700,
      webPreferences: {
        // The preload only uses contextBridge + ipcRenderer; both work in a
        // sandboxed renderer. Sandbox = stronger process isolation, smaller
        // attack surface if the renderer ever loads untrusted content (e.g.
        // a news article via a bug).
        sandbox: true,
        webSecurity: true,
        preload: path.join(import.meta.dirname, 'preload.js'),
      },
    })
    log('window created')

    // Strict CSP for the production renderer. We don't add it in dev because
    // Turbopack injects HMR WebSocket connections that 'self' would block.
    // The app makes no outbound HTTP from the renderer (everything goes via
    // IPC to the main process), so connect-src can be locked to 'self'.
    if (isProd) {
      mainWindow.webContents.session.webRequest.onHeadersReceived(
        (details, callback) => {
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              'Content-Security-Policy': [
                [
                  "default-src 'self'",
                  "script-src 'self'",
                  "style-src 'self' 'unsafe-inline'",
                  "img-src 'self' data: blob: https:",
                  "font-src 'self' data:",
                  "connect-src 'self'",
                  "frame-src 'none'",
                  "object-src 'none'",
                  "base-uri 'self'",
                ].join('; '),
              ],
            },
          })
        },
      )
    }

    // Refuse to open new top-level windows from inside the renderer. Any
    // outgoing link must go through shell.openExternal (already wired in
    // News and Ticker pages); window.open is a vector we don't need.
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    // Surface renderer/preload load failures so we don't crash silently.
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
      log('did-fail-load', { code, desc, url })
    })
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      log('render-process-gone', details)
    })
    mainWindow.on('unresponsive', () => log('window unresponsive'))
    mainWindow.on('responsive', () => log('window responsive'))

    bindLocalShortcuts(mainWindow)

    if (isProd) {
      log('loading url app://./home')
      await mainWindow.loadURL('app://./home')
      log('production url loaded')
    } else {
      const port = process.argv[2]
      log('loading dev url', { port })
      await mainWindow.loadURL(`http://localhost:${port}/home`)
      mainWindow.webContents.openDevTools()
      log('dev url loaded')
    }

    log('startup complete')

    // Run daily housekeeping in the background. None of these block the UI
    // and individual failures are logged but don't bring down the app.
    void runDailyBackup().catch((err) =>
      log('backup failed', err instanceof Error ? err : { err: String(err) }),
    )
    try {
      const purged = cleanupExpiredCache()
      log('cache cleanup', purged)
    } catch (err) {
      log('cache cleanup failed', err instanceof Error ? err : { err: String(err) })
    }

    // Long-running sessions (laptop closed for days, app left open)
    // would otherwise never re-trigger cleanupExpiredCache after boot,
    // letting api_cache grow without bound. Every 6 hours is harmless;
    // the operation is a single DELETE WHERE expires_at < ? on an
    // indexed column.
    const cleanupTimer = setInterval(
      () => {
        try {
          const purged = cleanupExpiredCache()
          if (purged.deleted > 0) log('periodic cache cleanup', purged)
        } catch (err) {
          log(
            'periodic cache cleanup failed',
            err instanceof Error ? err : { err: String(err) },
          )
        }
      },
      6 * 3600_000,
    )
    app.once('before-quit', () => clearInterval(cleanupTimer))

    // Pre-warm USD<->CAD on boot. Without a fresh FX row in the cache,
    // portfolio.ts/timeseries.ts silently fall back to rate=1 and the
    // CAD/USD display toggle appears to do nothing (every USD value
    // multiplied by 1 stays USD). 6 h TTL means this fires roughly
    // once per session. Frankfurter is free + fast, so the cost is
    // ~100 ms and the failure is non-blocking.
    void Promise.allSettled([
      getFxRate('USD', 'CAD'),
      getFxRate('CAD', 'USD'),
    ]).catch((err) => log('fx warmup failed', err instanceof Error ? err : { err: String(err) }))

    // Post-update hygiene. When the installed app version changes (either
    // a fresh install or an electron-updater install-on-quit), wipe the
    // news cache so the next refresh re-fetches with whatever filter or
    // routing the new version ships. Without this, a user who upgrades
    // to a build that changed provider behavior keeps seeing the old
    // cached results for up to 30 min (the news TTL).
    try {
      const currentVersion = app.getVersion()
      const lastSeen = getSetting('app.lastSeenVersion')
      if (lastSeen !== currentVersion) {
        invalidate('news:')
        setSetting('app.lastSeenVersion', currentVersion)
        log('post-update: invalidated news cache', { from: lastSeen, to: currentVersion })
      }
    } catch (err) {
      log('post-update hook failed', err instanceof Error ? err : { err: String(err) })
    }

    // One-time backfill for pre-v0.1.28 Questrade imports. Users who
    // imported their broker XLSX before the accounts feature existed
    // have transactions with account_id = NULL but the broker info is
    // sitting in their notes field. Walk those, re-attach to accounts,
    // and populate external_id so future re-imports are also
    // idempotent. Gated by a setting so it only runs once per install.
    try {
      const alreadyRan = getSetting('app.backfilledQuestradeAccounts')
      if (alreadyRan !== '1') {
        const { backfillQuestradeImports } = await import(
          './db/repo/transactions'
        )
        const r = backfillQuestradeImports()
        setSetting('app.backfilledQuestradeAccounts', '1')
        if (r.attached > 0 || r.accountsCreated > 0) {
          log('post-update: questrade backfill', r)
        }
      }
    } catch (err) {
      log(
        'questrade backfill failed',
        err instanceof Error ? err : { err: String(err) },
      )
    }
    void maybeCaptureDailySnapshot().catch((err) =>
      log('snapshot capture failed', err instanceof Error ? err : { err: String(err) }),
    )

    // Auto-update check (production only). electron-updater compares the
    // current app.getVersion() with the latest GitHub release on
    // Wrivard/stock-tracker and downloads/installs in-place for NSIS or
    // surfaces an OS notification for other targets. Failures are logged
    // and silent — never block the UI on update issues.
    if (isProd) {
      autoUpdater.logger = {
        info: (m: unknown) => log('updater:info', typeof m === 'string' ? m : { m }),
        warn: (m: unknown) => log('updater:warn', typeof m === 'string' ? m : { m }),
        error: (m: unknown) => log('updater:error', typeof m === 'string' ? m : { m }),
        debug: () => undefined,
      } as never
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.on('update-available', (info) =>
        log('updater:update-available', { version: info.version }),
      )
      autoUpdater.on('update-not-available', (info) =>
        log('updater:up-to-date', { version: info.version }),
      )
      autoUpdater.on('update-downloaded', (info) => {
        log('updater:downloaded', { version: info.version })
        // Notify the renderer so it can show an in-app toast with a
        // "Restart now" button. Windows toasts get missed; an in-app
        // banner that stays put doesn't.
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:downloaded', {
            version: info.version,
          })
        }
      })
      autoUpdater.on('error', (err) =>
        log('updater:error-event', err instanceof Error ? err : { err: String(err) }),
      )
      void autoUpdater.checkForUpdatesAndNotify().catch((err) =>
        log('updater check failed', err instanceof Error ? err : { err: String(err) }),
      )
    }
  } catch (err) {
    log('FATAL during startup', err instanceof Error ? err : { err: String(err) })
    if (isProd) {
      try {
        dialog.showErrorBox(
          'Beta Trading Hub — startup failed',
          err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err),
        )
      } catch {
        /* ignore */
      }
    }
    // Do NOT exit here. Keep the process alive so the user can see the
    // dialog and read the log file at userData/startup.log.
  }
})()

app.on('window-all-closed', () => {
  log('window-all-closed')
  closeDb()
  app.quit()
})
