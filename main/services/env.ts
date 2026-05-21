import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

// Best-effort load of `.env.local` next to package.json. This is a
// development convenience: production users enter their API keys via the
// Settings UI (stored in SQLite), so `.env.local` is optional.
const cwdEnv = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(cwdEnv)) {
  dotenv.config({ path: cwdEnv, quiet: true })
}
