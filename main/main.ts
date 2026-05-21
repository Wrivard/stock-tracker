import './services/env'

import path from 'path'
import { app, dialog, type BrowserWindow } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers/create-window'
import { closeDb, initDb } from './db/connection'
import { registerIpcHandlers } from './ipc/handlers'
import { maybeCaptureDailySnapshot } from './services/snapshots'
import { initStartupLog, log } from './util/logger'

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
        'Stock Tracker — uncaught exception',
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

    registerIpcHandlers()
    log('ipc handlers registered')

    mainWindow = createWindow('main', {
      width: 1280,
      height: 840,
      minWidth: 1024,
      minHeight: 700,
      webPreferences: {
        preload: path.join(import.meta.dirname, 'preload.js'),
      },
    })
    log('window created')

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

    // Capture today's portfolio snapshot in the background. Failures are
    // non-fatal and just logged.
    void maybeCaptureDailySnapshot().catch((err) =>
      log('snapshot capture failed', err instanceof Error ? err : { err: String(err) }),
    )
  } catch (err) {
    log('FATAL during startup', err instanceof Error ? err : { err: String(err) })
    if (isProd) {
      try {
        dialog.showErrorBox(
          'Stock Tracker — startup failed',
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
