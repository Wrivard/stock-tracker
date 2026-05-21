# Portfolio Tracker

Application desktop locale (Nextron / Electron + Next.js) pour suivre et gerer
un portefeuille d'actions. Toutes les donnees restent sur la machine. Les APIs
de marche utilisees sont des **free tiers** (Finnhub + Twelve Data) et un
service FX gratuit sans cle (Frankfurter).

> Statut : etapes 1 a 8 implementees. Dashboard, holdings live, historique,
> rebalance, news, settings, build packaged.

## Demarrage rapide

```bash
npm install
npm run dev      # ouvre la fenetre Electron en mode developpement
```

ou bien lance l'installeur dans `dist/` apres `npm run build`.

## Cles API — ou les obtenir

L'app a besoin de **deux** cles gratuites :

| Provider | A quoi ca sert | Cle gratuite |
| --- | --- | --- |
| **Finnhub** | Quotes temps reel, profils d'entreprise, news | https://finnhub.io/register |
| **Twelve Data** | Prix historiques (chandelles journalieres) | https://twelvedata.com/register |

Le FX USD↔CAD est servi par **Frankfurter** (gratuit, sans cle).

## Ou rentrer les cles

Deux options (les deux sont supportees, choisis celle qui te plait) :

### Option 1 — dans l'app (recommande)

1. Lance l'app
2. Sidebar → **Settings**
3. Section **Cles API** : colle ta cle Finnhub, clique **Enregistrer**
4. Pareil pour Twelve Data
5. Le badge passe a **Configuree** ; click **Actualiser** dans le header

Les cles sont stockees localement dans la table `settings` du SQLite. Elles
ne quittent jamais ta machine sauf pour les appels REST vers les providers
respectifs.

### Option 2 — fichier `.env.local`

Pour le mode developpement uniquement. Cree un fichier `.env.local` a la
racine du projet (a cote de `package.json`) :

```
FINNHUB_API_KEY=ta_cle_finnhub
TWELVEDATA_API_KEY=ta_cle_twelvedata
```

Le fichier est ignore par git (`.gitignore`). Au premier boot, l'app les
lit et les utilise si la table `settings` n'a rien de configure.

## Stack technique

- **Nextron** (Electron + Next.js) — main + renderer separes
- **TypeScript** partout
- **Tailwind CSS v4** + **shadcn/ui** (style new-york, base neutral)
- **Recharts** via shadcn `chart` (pie + area chart)
- **SQLite** local via `better-sqlite3`, migrations versionnees
- **Zustand** pour le state global UI (devise, langue, intervalle)
- **next-themes** pour dark/light + **sonner** pour les toasts
- **Zod** pour la validation des IPC entrantes

## Structure

```
stock tracker/
├── main/                    # Process Electron
│   ├── db/                  # connection, migrations, seed, repos
│   ├── services/            # market-api, providers, cache, throttle,
│   │                        # portfolio aggregator, snapshots, env
│   ├── ipc/                 # channels + handlers
│   ├── helpers/             # createWindow (du scaffold Nextron)
│   ├── main.ts              # entry point Electron
│   └── preload.ts           # contextBridge api
├── renderer/                # App Next.js
│   ├── components/
│   │   ├── layout/          # AppLayout, AppHeader (sidebar + topbar)
│   │   ├── dashboard/       # KpiCard, SectorPieChart
│   │   ├── history/         # PortfolioValueChart
│   │   ├── holdings/        # TransactionForm, SectorPicker
│   │   └── ui/              # composants shadcn
│   ├── lib/                 # api, store, i18n, hooks, format, utils
│   ├── pages/               # home, holdings, history, rebalance, news, settings
│   └── styles/globals.css
├── resources/               # icones Electron
├── components.json          # config shadcn
├── electron-builder.yml     # config packaging
└── tsconfig.json            # alias @/* -> renderer/*
```

## Fonctionnalites

### Dashboard
- KPIs : valeur totale, gain/perte total, variation du jour
- Pie chart d'allocation par secteur (Recharts via shadcn)
- Top et bottom performers par P&L %

### Holdings
- Table avec : ticker, nom, secteur, qte, cout moyen, prix actuel, var. jour,
  valeur marche, P&L $ et %, poids %
- Ajouter / modifier / supprimer une transaction (achat / vente)
- Reassigner manuellement un secteur (override la detection auto Finnhub)
- Dialog d'historique des transactions par ticker

### Historique
- Snapshot quotidien automatique au boot (si pas deja fait aujourd'hui)
- Capture manuelle a la demande
- Area chart de la valeur du portefeuille avec sélecteurs 1S / 1M / 3M / 1A / Tout
- Cartes recap : valeur de fin, variation sur la periode, nombre de snapshots

### Rebalance
- Cibles % editables par secteur (persistees dans `settings`)
- Comparaison actuel vs cible (% et valeur)
- Suggestions d'achat / vente quand l'ecart depasse ±5 pp
- Validation : total des cibles doit valoir 100 %

### News
- Feed agrege de tous les tickers du portefeuille (Finnhub `company-news`)
- Filtre par ticker
- Liens ouverts dans le navigateur externe (jamais a l'interieur d'Electron)

### Settings
- Cles API (input avec show/hide + bouton **Enregistrer**)
- Devise d'affichage (CAD / USD), langue (FR / EN), theme (sombre / clair)
- Intervalle d'auto-refresh des cotations (en secondes ; 0 = desactive)

## Caching, throttling et FX

- **Quote** : TTL 60 s, fallback sur cache perime si rate limit atteint
- **Profile** : TTL 24 h
- **News** : TTL 30 min
- **Historique** : TTL 6 h
- **FX** : TTL 6 h (Frankfurter, donnees ECB)
- **Rate limit** : token bucket en memoire par provider
  - Finnhub : 20 burst, 1 req/s
  - Twelve Data : 8 burst, 8/60 req/s
  - Frankfurter : 10 burst, 5 req/s

Quand une donnee provient du cache perime (apres une erreur de rate limit
par exemple), l'UI l'indique : `Stale` badge, italique gris sur les prix.

## Devises et symboles

- Par defaut, l'app affiche tout en **CAD**. Toggle USD dans le header ou
  dans Settings.
- FX gere automatiquement via **Frankfurter** (gratuit, taux ECB du jour).
- Tickers canadiens : utilise le suffixe explicite, ex. `SHOP.TO`, `ENB.TO`,
  `WCN.TO`. Pour TSX Venture, suffixe `.V`. Twelve Data accepte ces formats
  via une conversion interne vers `:TSX` / `:TSXV`.
- Tickers US : pas de suffixe, ex. `AAPL`, `MSFT`.

## Scripts

```bash
npm run dev      # Nextron en mode developpement (hot reload)
npm run build    # Build packagee via electron-builder (output : dist/)
```

Au build, electron-builder produit selon ton OS :
- Windows : un installeur NSIS (`Portfolio Tracker-<version>-setup.exe`)
- macOS : un dmg
- Linux : un AppImage

## Donnees locales

L'app stocke ses donnees dans `app.getPath('userData')`, qui resout :
- Windows : `%APPDATA%\Portfolio Tracker\portfolio.sqlite`
- macOS : `~/Library/Application Support/Portfolio Tracker/portfolio.sqlite`
- Linux : `~/.config/Portfolio Tracker/portfolio.sqlite`

En mode dev, le suffixe ` (development)` est ajoute au dossier pour ne pas
melanger les bases dev et prod.

## Limitations connues

- Finnhub free tier ne couvre pas les profils / news de tous les non-US.
  L'app gere l'erreur et continue (autres tickers).
- Twelve Data free tier : 800 requetes/jour. Largement suffisant pour
  refresh quotidien d'un portefeuille perso.
- Pas de tracking de dividendes ni de splits dans cette version.
- Pas d'export CSV pour l'instant.
