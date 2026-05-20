export const IPC = {
  sectors: {
    list: 'sectors:list',
  },
  tickers: {
    list: 'tickers:list',
    get: 'tickers:get',
    upsert: 'tickers:upsert',
    delete: 'tickers:delete',
    setSector: 'tickers:setSector',
  },
  transactions: {
    list: 'transactions:list',
    create: 'transactions:create',
    update: 'transactions:update',
    delete: 'transactions:delete',
  },
  holdings: {
    list: 'holdings:list',
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    list: 'settings:list',
    delete: 'settings:delete',
  },
} as const
