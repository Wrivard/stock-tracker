import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

// Best-effort load of `.env.local` from two locations:
// - process.cwd() (dev convenience: `.env.local` lives next to package.json)
// - %APPDATA%\stock-tracker\.env.local (installed-app convenience: the user
//   can drop keys there without going through Settings)
//
// Both files are optional. Production users typically enter keys via the
// Settings UI which writes to SQLite; this is just a seed source.
//
// Note: we can't call app.getPath('userData') here because `electron` is
// not initialized yet. We resolve the same path manually.
function tryLoad(p: string): void {
  if (fs.existsSync(p)) dotenv.config({ path: p, quiet: true })
}

tryLoad(path.resolve(process.cwd(), '.env.local'))

const appData =
  process.env.APPDATA ??
  (process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming')
    : null)
if (appData) {
  tryLoad(path.join(appData, 'stock-tracker', '.env.local'))
}
