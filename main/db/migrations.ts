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
  {
    // v3 — multi-account support. Canadian users juggle TFSA, RRSP,
    // FHSA, taxable cash accounts that have totally different tax
    // treatments. The Questrade XLSX already exposes Account # +
    // Account Type per row; we were merging them all and throwing
    // that signal away. New `accounts` table + nullable account_id
    // FK on transactions: existing rows stay account_id=NULL (the
    // "uncategorized" bucket), new rows from Questrade import or
    // the UI can pick an account.
    //
    // Kind = enum string we control on the app side. Broker number
    // is the raw "Account #" from Questrade so we can de-dupe on
    // re-import.
    version: 3,
    up: `
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN (
          'tfsa','rrsp','fhsa','lira','resp','taxable','other'
        )),
        broker_account_number TEXT,
        default_currency TEXT CHECK (default_currency IN ('USD','CAD')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (broker_account_number)
      );

      ALTER TABLE transactions
        ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;

      CREATE INDEX idx_transactions_account ON transactions(account_id);
    `,
  },
  {
    // v4 — dividends ledger. Questrade XLSX already emits DIV /
    // dividend reinvestment rows that we were silently dropping in
    // import-questrade (Activity Type != 'Trades'). Now we capture
    // them as a separate ledger keyed by (ticker, paid_at, account)
    // so total return calculations + per-ticker yield + tax-year
    // income views become possible.
    //
    // No quantity/price split — Questrade reports dividends as a
    // single cash amount per payment. ticker is nullable so manual
    // entries for things like cash interest can still be recorded
    // when we eventually surface that UI.
    version: 4,
    up: `
      CREATE TABLE dividends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT REFERENCES tickers(symbol) ON DELETE SET NULL,
        account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        amount REAL NOT NULL CHECK (amount >= 0),
        currency TEXT NOT NULL CHECK (currency IN ('USD','CAD')),
        paid_at TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'dividend'
          CHECK (kind IN ('dividend','interest','distribution')),
        notes TEXT,
        source TEXT NOT NULL DEFAULT 'manual'
          CHECK (source IN ('manual','questrade')),
        external_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX idx_dividends_ticker ON dividends(ticker);
      CREATE INDEX idx_dividends_paid_at ON dividends(paid_at);
      CREATE INDEX idx_dividends_account ON dividends(account_id);
      -- external_id is the row's natural key when imported from
      -- Questrade (built from ticker + date + amount); UNIQUE
      -- ensures re-imports don't duplicate the same payment.
      CREATE UNIQUE INDEX idx_dividends_external
        ON dividends(external_id) WHERE external_id IS NOT NULL;
    `,
  },
  {
    // v5 — make Questrade trade re-imports idempotent. Before this,
    // a second import of the same XLSX file duplicated every Buy/Sell
    // row in the transactions table (only dividends had external_id
    // dedup). Now transactions get an optional external_id with a
    // partial-unique index, mirroring the dividends pattern. The
    // importer builds the id from (account # + ticker + date + kind
    // + quantity + price) so the same row imported twice collapses
    // into a single transaction row.
    version: 5,
    up: `
      ALTER TABLE transactions ADD COLUMN external_id TEXT;
      CREATE UNIQUE INDEX idx_transactions_external
        ON transactions(external_id) WHERE external_id IS NOT NULL;
    `,
  },
  {
    // v6 — multi-profile support. The user can now manage separate
    // sets of accounts (their own + their partner's, for example),
    // each with its own TFSA/RRSP/FHSA/taxable accounts. Implemented
    // as a profile_id column on accounts (NOT NULL DEFAULT 1), with
    // a single seeded "Mes placements" profile that all existing
    // accounts get assigned to. Switching profiles in the UI changes
    // the active-profile setting and every read query implicitly
    // filters by it.
    //
    // Transactions / dividends inherit the profile via their
    // account_id FK; rows where account_id IS NULL stay visible
    // across all profiles (intentionally — they're loose entries
    // the user hasn't categorized yet).
    version: 6,
    up: `
      CREATE TABLE profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO profiles (name, color, created_at, updated_at)
        VALUES ('Mes placements', NULL, strftime('%s', 'now') * 1000,
                                       strftime('%s', 'now') * 1000);

      -- SQLite ALTER TABLE ... ADD COLUMN doesn't allow NOT NULL
      -- with a non-literal default in the same statement. Add as
      -- nullable, backfill everyone to profile 1, then app-level
      -- code (accounts repo + IPC) enforces NOT NULL on writes.
      ALTER TABLE accounts ADD COLUMN profile_id INTEGER
        REFERENCES profiles(id) ON DELETE CASCADE;
      UPDATE accounts SET profile_id = 1;

      CREATE INDEX idx_accounts_profile ON accounts(profile_id);
    `,
  },
  {
    // v7 — per-account annual contribution limit. Registered plans
    // like the FHSA (CELIAPP) cap yearly contributions ($8,000 for
    // the FHSA). We track how much has gone into each account per
    // calendar year — computed from gross buy transactions — so the
    // user knows how much room is left before they should redirect
    // money to another account (e.g. their TFSA / CELI).
    //
    // Nullable REAL: NULL = no limit tracked (the default for taxable
    // accounts and anything the user hasn't configured). Existing
    // FHSA accounts are backfilled to the standard $8,000 so the
    // feature lights up immediately on data that's already imported.
    // The user can override the number per account in the Accounts UI
    // (TFSA/RRSP limits vary per person, so we don't presume those).
    version: 7,
    up: `
      ALTER TABLE accounts ADD COLUMN annual_contribution_limit REAL;
      UPDATE accounts SET annual_contribution_limit = 8000 WHERE kind = 'fhsa';
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
