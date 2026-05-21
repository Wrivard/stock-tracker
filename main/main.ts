import './services/env'

import path from 'path'
import { app } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers/create-window'
import { closeDb, initDb } from './db/connection'
import { registerIpcHandlers } from './ipc/handlers'
import { maybeCaptureDailySnapshot } from './services/snapshots'

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

;(async () => {
  await app.whenReady()

  initDb()
  registerIpcHandlers()

  const mainWindow = createWindow('main', {
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
    },
  })

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/home`)
    mainWindow.webContents.openDevTools()
  }

  // Capture today's portfolio snapshot in the background (no-op if already
  // recorded today). Failures are non-fatal — they're logged in console.
  void maybeCaptureDailySnapshot().catch((err) =>
    console.error('[snapshots] capture failed:', err),
  )
})()

app.on('window-all-closed', () => {
  closeDb()
  app.quit()
})
