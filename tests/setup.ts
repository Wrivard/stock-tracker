import { vi } from 'vitest'

// The `electron` module is unavailable outside of Electron's runtime. Most of
// our DB / services code only touches `app.getPath('userData')` to locate the
// SQLite file; tests don't care about that path because they inject an
// in-memory database directly via `setDb()` in db/connection.ts.
vi.mock('electron', () => {
  return {
    app: {
      getPath: () => '/tmp/vitest-stock-tracker',
      getName: () => 'stock-tracker',
      getVersion: () => '0.0.0-test',
      getAppPath: () => '/tmp/vitest-stock-tracker',
      whenReady: () => Promise.resolve(),
      isReady: () => true,
      on: () => undefined,
      setPath: () => undefined,
      disableHardwareAcceleration: () => undefined,
      quit: () => undefined,
    },
    BrowserWindow: class {},
    ipcMain: { handle: () => undefined, on: () => undefined },
    shell: { openExternal: () => Promise.resolve() },
    dialog: { showErrorBox: () => undefined, showSaveDialog: () => Promise.resolve({ canceled: true }) },
    globalShortcut: { register: () => true, unregisterAll: () => undefined },
  }
})
