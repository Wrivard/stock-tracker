# Portfolio Tracker

Application desktop locale (Nextron / Electron + Next.js) pour suivre et gerer
un portefeuille d'actions. Toutes les donnees restent sur la machine, les APIs
de marche utilisees sont des free tiers (Finnhub + Twelve Data).

> Statut : etape 1 (scaffold). Les fonctionnalites holdings/dashboard/news ne
> sont pas encore implementees.

## Stack

- **Nextron** (Electron + Next.js) — main + renderer
- **TypeScript** partout
- **Tailwind CSS v4** + **shadcn/ui** (style "new-york", base color neutral)
- **Recharts** (via shadcn `chart`) — a integrer
- **SQLite** local via `better-sqlite3` — a integrer
- **Zustand** pour le state global — a integrer
- **next-themes** + **sonner** pour dark mode et toasts

## Prerequis

- Node.js >= 20 (teste avec 22.x)
- npm (ou pnpm / yarn — npm utilise par defaut ici)
- Un OS desktop (Windows / macOS / Linux)

## Installation

```bash
npm install
```

Le `postinstall` recompile les modules natifs Electron via `electron-builder`.

## Cles API (a venir aux etapes 3+)

L'app utilise deux providers gratuits :

- **Finnhub** — quotes temps reel, profils d'entreprise, news. Cle gratuite a
  obtenir sur https://finnhub.io.
- **Twelve Data** — prix historiques (chandelles journalieres). Cle gratuite a
  obtenir sur https://twelvedata.com (800 requetes/jour sur free tier).
- (Optionnel) **Alpha Vantage** — alternative historique.

Les cles sont stockees dans `.env.local` ET configurables depuis l'ecran
Settings (sauvegardees en SQLite). Format `.env.local` :

```
FINNHUB_API_KEY=ta_cle
TWELVEDATA_API_KEY=ta_cle
```

## Scripts

```bash
npm run dev      # Lance Next.js + Electron en mode dev
npm run build    # Build packagee via electron-builder
```

## Structure

```
stock tracker/
├── main/                 # Process Electron (Node), IPC, acces SQLite, APIs
│   ├── main.ts
│   ├── preload.ts
│   └── helpers/
├── renderer/             # Application Next.js (UI)
│   ├── pages/
│   ├── components/ui/    # Composants shadcn
│   ├── lib/utils.ts      # cn() helper
│   ├── styles/globals.css
│   └── tsconfig.json
├── resources/            # Icones Electron, etc.
├── components.json       # Config shadcn (cible le renderer)
├── electron-builder.yml  # Config packaging
└── tsconfig.json         # tsconfig racine (paths @/* -> renderer/*)
```

Le code main (Node/Electron) ne doit jamais importer du code renderer
directement. Toute communication passe par l'IPC (`ipcMain` <-> `ipcRenderer`
via le preload script et `contextBridge`).
