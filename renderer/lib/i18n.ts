import { useUi } from './store'

type Dict = Record<string, { fr: string; en: string }>

const dict: Dict = {
  'nav.dashboard': { fr: 'Tableau de bord', en: 'Dashboard' },
  'nav.holdings': { fr: 'Holdings', en: 'Holdings' },
  'nav.history': { fr: 'Historique', en: 'History' },
  'nav.rebalance': { fr: 'Reequilibrage', en: 'Rebalance' },
  'nav.news': { fr: 'Actualites', en: 'News' },
  'nav.settings': { fr: 'Parametres', en: 'Settings' },

  'common.refresh': { fr: 'Actualiser', en: 'Refresh' },
  'common.refreshing': { fr: 'Actualisation…', en: 'Refreshing…' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel' },
  'common.save': { fr: 'Enregistrer', en: 'Save' },
  'common.delete': { fr: 'Supprimer', en: 'Delete' },
  'common.edit': { fr: 'Modifier', en: 'Edit' },
  'common.loading': { fr: 'Chargement…', en: 'Loading…' },
  'common.never': { fr: 'jamais', en: 'never' },
  'common.justNow': { fr: "a l'instant", en: 'just now' },
  'common.minAgo': { fr: 'il y a {n} min', en: '{n} min ago' },
  'common.hourAgo': { fr: 'il y a {n} h', en: '{n} h ago' },
  'common.dayAgo': { fr: 'il y a {n} j', en: '{n} d ago' },
  'common.stale': { fr: 'Perime', en: 'Stale' },
  'common.cached': { fr: 'Cache', en: 'Cached' },

  'dashboard.totalValue': { fr: 'Valeur totale', en: 'Total value' },
  'dashboard.totalPnl': { fr: 'Gain / perte', en: 'P&L' },
  'dashboard.dayChange': { fr: 'Variation du jour', en: 'Day change' },
  'dashboard.allocation': { fr: 'Allocation par secteur', en: 'Sector allocation' },
  'dashboard.topPerformers': { fr: 'Meilleures performances', en: 'Top performers' },
  'dashboard.bottomPerformers': { fr: 'Pires performances', en: 'Bottom performers' },
  'dashboard.empty': {
    fr: 'Aucun ticker. Ajoute une premiere transaction dans Holdings.',
    en: 'No holdings yet. Add your first transaction in Holdings.',
  },
  'dashboard.noQuotes': {
    fr: 'Aucune cotation en cache. Clique sur Actualiser pour recuperer les prix.',
    en: 'No cached quotes. Click Refresh to fetch live prices.',
  },
  'dashboard.staleWarning': {
    fr: 'Donnees periees — clic sur Actualiser.',
    en: 'Stale data — click Refresh.',
  },

  'holdings.title': { fr: 'Holdings', en: 'Holdings' },
  'holdings.subtitle': {
    fr: 'Positions courantes calculees a partir des transactions stockees localement.',
    en: 'Current positions, computed from your local transaction history.',
  },
  'holdings.addTx': { fr: 'Ajouter une transaction', en: 'Add transaction' },
  'holdings.empty': {
    fr: 'Aucun ticker. Clique sur « Ajouter une transaction » pour commencer.',
    en: 'No tickers yet. Click "Add transaction" to start.',
  },
  'holdings.col.ticker': { fr: 'Ticker', en: 'Ticker' },
  'holdings.col.name': { fr: 'Nom', en: 'Name' },
  'holdings.col.sector': { fr: 'Secteur', en: 'Sector' },
  'holdings.col.quantity': { fr: 'Quantite', en: 'Quantity' },
  'holdings.col.avgCost': { fr: 'Cout moyen', en: 'Avg. cost' },
  'holdings.col.price': { fr: 'Prix actuel', en: 'Price' },
  'holdings.col.dayChange': { fr: 'Var. jour', en: 'Day chg.' },
  'holdings.col.marketValue': { fr: 'Valeur marche', en: 'Market value' },
  'holdings.col.pnl': { fr: 'Gain / perte', en: 'P&L' },
  'holdings.col.weight': { fr: 'Poids %', en: 'Weight %' },

  'tx.new': { fr: 'Nouvelle transaction', en: 'New transaction' },
  'tx.edit': { fr: 'Modifier la transaction', en: 'Edit transaction' },
  'tx.fields.ticker': { fr: 'Ticker', en: 'Ticker' },
  'tx.fields.kind': { fr: 'Type', en: 'Kind' },
  'tx.fields.buy': { fr: 'Achat', en: 'Buy' },
  'tx.fields.sell': { fr: 'Vente', en: 'Sell' },
  'tx.fields.quantity': { fr: 'Quantite', en: 'Quantity' },
  'tx.fields.price': { fr: 'Prix unitaire', en: 'Unit price' },
  'tx.fields.currency': { fr: 'Devise', en: 'Currency' },
  'tx.fields.fees': { fr: 'Frais', en: 'Fees' },
  'tx.fields.date': { fr: 'Date', en: 'Date' },
  'tx.fields.notes': { fr: 'Notes (optionnel)', en: 'Notes (optional)' },
  'tx.titleFor': { fr: 'Transactions — {ticker}', en: 'Transactions — {ticker}' },

  'settings.title': { fr: 'Parametres', en: 'Settings' },
  'settings.updates': { fr: 'Mises a jour', en: 'Updates' },
  'settings.updatesHelp': {
    fr: 'Verifie GitHub pour une version plus recente et installe automatiquement (installation NSIS uniquement).',
    en: 'Checks GitHub for a newer release and installs in-place (NSIS install only).',
  },
  'settings.currentVersion': { fr: 'Version installee', en: 'Installed version' },
  'settings.checkUpdates': { fr: 'Verifier les mises a jour', en: 'Check for updates' },
  'settings.checking': { fr: 'Verification…', en: 'Checking…' },
  'settings.upToDate': { fr: 'Tu es a jour.', en: "You're up to date." },
  'settings.updateAvailable': {
    fr: 'Version {version} disponible',
    en: 'Version {version} available',
  },
  'settings.restartToInstall': {
    fr: 'Redemarrer pour installer',
    en: 'Restart to install',
  },
  'settings.backups': { fr: 'Sauvegardes', en: 'Backups' },
  'settings.backupsHelp': {
    fr: 'Sauvegardes quotidiennes automatiques. 7 plus recentes conservees.',
    en: 'Automatic daily backups. 7 most recent retained.',
  },
  'settings.backupNow': { fr: 'Sauvegarder maintenant', en: 'Back up now' },
  'settings.exportSqlite': { fr: 'Exporter la base', en: 'Export database' },
  'settings.openBackupFolder': { fr: 'Ouvrir le dossier', en: 'Open folder' },
  'settings.noBackupsYet': {
    fr: 'Aucune sauvegarde pour l\'instant.',
    en: 'No backups yet.',
  },
  'settings.apiKeys': { fr: 'Cles API', en: 'API keys' },
  'settings.apiKeysHelp': {
    fr: 'Free tiers — finnhub.io et twelvedata.com. OpenAI (optionnel) pour le recap IA. Stockees localement.',
    en: 'Free tiers — finnhub.io and twelvedata.com. OpenAI (optional) for the AI recap. Stored locally.',
  },
  'settings.finnhubKey': { fr: 'Cle Finnhub', en: 'Finnhub key' },
  'settings.twelvedataKey': { fr: 'Cle Twelve Data', en: 'Twelve Data key' },
  'settings.openaiKey': { fr: 'Cle OpenAI (optionnel)', en: 'OpenAI key (optional)' },
  'settings.openaiHint': {
    fr: 'Active le recap IA des actualites. gpt-4o-mini, ~0.0005 $ par recap.',
    en: 'Enables the AI news recap. gpt-4o-mini, ~$0.0005 per recap.',
  },
  'settings.placeholderHidden': { fr: '••••••••••••', en: '••••••••••••' },
  'settings.preferences': { fr: 'Preferences', en: 'Preferences' },
  'settings.displayCurrency': { fr: "Devise d'affichage", en: 'Display currency' },
  'settings.locale': { fr: 'Langue', en: 'Language' },
  'settings.theme': { fr: 'Theme', en: 'Theme' },
  'settings.refreshIntervalSec': {
    fr: 'Intervalle de rafraichissement (secondes)',
    en: 'Auto-refresh interval (seconds)',
  },

  'rebalance.title': { fr: 'Reequilibrage', en: 'Rebalance' },
  'rebalance.targetsHelp': {
    fr: "Definis le pourcentage cible par secteur. L'app calcule l'ecart vs courant et suggere des ajustements.",
    en: 'Set target % per sector. The app shows the deviation from current and suggests adjustments.',
  },
  'rebalance.targetPct': { fr: 'Cible %', en: 'Target %' },
  'rebalance.currentPct': { fr: 'Actuel %', en: 'Current %' },
  'rebalance.deltaPct': { fr: 'Ecart %', en: 'Δ %' },
  'rebalance.deltaValue': { fr: 'Ecart $', en: 'Δ $' },
  'rebalance.action': { fr: 'Action', en: 'Action' },
  'rebalance.totalsMustSum': {
    fr: 'La somme des cibles vaut {total}% (devrait etre 100%).',
    en: 'Targets sum to {total}% (should be 100%).',
  },

  'news.title': { fr: 'Actualites', en: 'News' },
  'news.allTickers': { fr: 'Tous les tickers', en: 'All tickers' },
  'news.empty': {
    fr: 'Aucune actualite. Ajoute des holdings ou actualise pour charger.',
    en: 'No news. Add holdings or click Refresh to load.',
  },
  'news.recapButton': { fr: 'Recap IA', en: 'AI recap' },
  'news.recapBusy': { fr: 'Generation…', en: 'Generating…' },
  'news.recapTitle': { fr: 'Recap de la semaine', en: 'Weekly recap' },
  'news.recapNoKey': {
    fr: 'Cle OpenAI manquante. Configure-la dans Parametres pour activer le recap IA.',
    en: 'OpenAI key missing. Set it in Settings to enable the AI recap.',
  },
  'news.recapMeta': {
    fr: '{articles} articles · {tickers} tickers · {model}',
    en: '{articles} articles · {tickers} tickers · {model}',
  },

  'onboarding.welcome.title': {
    fr: 'Bienvenue dans Beta Trading Hub',
    en: 'Welcome to Beta Trading Hub',
  },
  'onboarding.welcome.body': {
    fr: 'App locale, tes donnees restent sur ta machine. 3 etapes rapides pour demarrer.',
    en: 'Local app, your data stays on your machine. 3 quick steps to get started.',
  },
  'onboarding.start': { fr: 'Commencer', en: 'Get started' },
  'onboarding.next': { fr: 'Suivant', en: 'Next' },
  'onboarding.skip': { fr: 'Passer cette etape', en: 'Skip this step' },
  'onboarding.finish': { fr: 'Terminer', en: 'Finish' },
  'onboarding.keys.title': { fr: 'Cles API gratuites', en: 'Free API keys' },
  'onboarding.keys.body': {
    fr: 'Tu peux ajouter ces cles maintenant ou plus tard dans Parametres. L\'app fonctionne sans, mais sans cotations live.',
    en: 'Add these keys now or later in Settings. The app works without, but no live quotes.',
  },
  'onboarding.tx.title': { fr: 'Premiere transaction', en: 'First transaction' },
  'onboarding.tx.body': {
    fr: 'Saisis ta premiere position pour voir le dashboard se remplir.',
    en: 'Add your first position to see the dashboard populate.',
  },
  'onboarding.targets.title': { fr: 'Cibles par secteur (optionnel)', en: 'Sector targets (optional)' },
  'onboarding.targets.body': {
    fr: 'Definis ton allocation cible pour declencher les suggestions de reequilibrage. Tu peux y revenir plus tard.',
    en: 'Set your target allocation to enable rebalance suggestions. You can edit later.',
  },
  'onboarding.done.title': { fr: 'Tout est pret', en: 'All set' },
  'onboarding.done.body': {
    fr: 'L\'app est configuree. Clique sur Actualiser dans le header pour charger les cotations.',
    en: 'The app is configured. Click Refresh in the header to load quotes.',
  },
  'history.title': { fr: 'Historique', en: 'History' },
  'history.empty': {
    fr: 'Aucun snapshot pour l\'instant. Le premier sera enregistre des qu\'un prix sera disponible.',
    en: 'No snapshots yet. The first one will be captured once a quote is available.',
  },

  'import.title': { fr: 'Importer un broker', en: 'Import broker' },
  'import.help': {
    fr: 'Charge l\'export "Activities" XLSX de Questrade. On importe les achats et ventes, et on cree automatiquement les tickers inconnus.',
    en: 'Upload Questrade\'s "Activities" XLSX export. We import buys/sells and auto-create any unknown tickers.',
  },
  'import.questradeButton': { fr: 'Importer Questrade', en: 'Import Questrade' },
  'import.questradeBusy': { fr: 'Import en cours…', en: 'Importing…' },
  'import.summary': {
    fr: '{imported} transactions importees · {skippedNonTrade} non-trades ignorees · {skippedInvalid} invalides',
    en: '{imported} trades imported · {skippedNonTrade} non-trades skipped · {skippedInvalid} invalid',
  },
  'import.newTickers': {
    fr: '{n} nouveaux tickers ajoutes : {list}',
    en: '{n} new tickers added: {list}',
  },
  'import.canceled': { fr: 'Import annule.', en: 'Import canceled.' },
  'onboarding.import.title': { fr: 'Importer un broker (optionnel)', en: 'Import broker (optional)' },
  'onboarding.import.body': {
    fr: 'Charge directement l\'export XLSX de Questrade pour preremplir tes positions. Sinon, passe et saisis manuellement a l\'etape suivante.',
    en: 'Upload your Questrade XLSX export to prefill your positions. Otherwise, skip and add manually in the next step.',
  },
}

export type TKey = keyof typeof dict

interface UseT {
  t: (key: TKey, vars?: Record<string, string | number>) => string
  locale: 'fr' | 'en'
}

export function useT(): UseT {
  const locale = useUi((s) => s.locale)
  const t = (key: TKey, vars?: Record<string, string | number>) => {
    const entry = dict[key]
    if (!entry) return key
    let s = entry[locale] ?? entry.fr
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
    return s
  }
  return { t, locale }
}

export function formatRelativeTime(fetchedAt: number | null, locale: 'fr' | 'en'): string {
  if (!fetchedAt) return locale === 'fr' ? 'jamais' : 'never'
  const diff = Date.now() - fetchedAt
  if (diff < 60_000) return locale === 'fr' ? "a l'instant" : 'just now'
  if (diff < 3600_000) {
    const m = Math.round(diff / 60_000)
    return locale === 'fr' ? `il y a ${m} min` : `${m} min ago`
  }
  if (diff < 86_400_000) {
    const h = Math.round(diff / 3600_000)
    return locale === 'fr' ? `il y a ${h} h` : `${h} h ago`
  }
  const d = Math.round(diff / 86_400_000)
  return locale === 'fr' ? `il y a ${d} j` : `${d} d ago`
}
