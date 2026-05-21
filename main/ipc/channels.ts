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
    apiKeyStatus: 'settings:apiKeyStatus',
    setApiKey: 'settings:setApiKey',
  },
  market: {
    quote: 'market:quote',
    profile: 'market:profile',
    news: 'market:news',
    history: 'market:history',
    fxRate: 'market:fxRate',
    refreshTicker: 'market:refreshTicker',
    refreshAll: 'market:refreshAll',
    status: 'market:status',
    invalidateQuotes: 'market:invalidateQuotes',
    portfolioNews: 'market:portfolioNews',
    search: 'market:search',
    etfDetails: 'market:etfDetails',
  },
  snapshots: {
    list: 'snapshots:list',
    capture: 'snapshots:capture',
  },
  portfolio: {
    overview: 'portfolio:overview',
  },
  shell: {
    openExternal: 'shell:openExternal',
  },
  backup: {
    list: 'backup:list',
    runNow: 'backup:runNow',
    exportTo: 'backup:exportTo',
    openFolder: 'backup:openFolder',
  },
  updater: {
    check: 'updater:check',
    currentVersion: 'updater:currentVersion',
    quitAndInstall: 'updater:quitAndInstall',
  },
} as const
