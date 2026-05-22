import type Database from 'better-sqlite3'

interface Migration {
  version: number
  up: string
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE sectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        label_fr TEXT NOT NULL,
        label_en TEXT NOT NULL,
        color TEXT
      );

      CREATE TABLE tickers (
        symbol TEXT PRIMARY KEY,
        name TEXT,
        currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','CAD')),
        exchange TEXT,
        sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
        sector_override INTEGER NOT NULL DEFAULT 0,
        finnhub_industry TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL REFERENCES tickers(symbol) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('buy','sell')),
        quantity REAL NOT NULL CHECK (quantity > 0),
        price REAL NOT NULL CHECK (price >= 0),
        currency TEXT NOT NULL CHECK (currency IN ('USD','CAD')),
        fees REAL NOT NULL DEFAULT 0 CHECK (fees >= 0),
        notes TEXT,
        occurred_at TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX idx_transactions_ticker ON transactions(ticker);
      CREATE INDEX idx_transactions_occurred ON transactions(occurred_at);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE portfolio_snapshots (
        date TEXT PRIMARY KEY,
        total_value_cad REAL NOT NULL,
        total_value_usd REAL,
        per_sector_json TEXT,
        per_holding_json TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE api_cache (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `,
  },
  {
    // v2 — index api_cache.expires_at so the periodic cleanup and
    // the boot-time scan don't full-table-scan once the cache has
    // accumulated tens of thousands of rows after a few months of
    // daily refresh. Idempotent: IF NOT EXISTS guards against re-run
    // if a future migration somehow lands twice.
    version: 2,
    up: `
      CREATE INDEX IF NOT EXISTS idx_api_cache_expires
        ON api_cache(expires_at);
    `,
  },
]

export function runMigrations(db: Database.Database): void {
  const row = db.pragma('user_version') as { user_version: number }[]
  const current = row[0]?.user_version ?? 0
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      db.transaction(() => {
        db.exec(m.up)
        db.pragma(`user_version = ${m.version}`)
      })()
    }
  }
}
