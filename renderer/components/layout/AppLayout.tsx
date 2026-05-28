import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Briefcase,
  LayoutDashboard,
  LineChart,
  Newspaper,
  Settings as SettingsIcon,
  Sparkles,
  Target,
  UserCircle2,
  Wallet,
} from 'lucide-react'

import type { TransactionInput } from '../../../main/db/types'
import { AppHeader } from '@/components/layout/AppHeader'
import { BrandLogo } from '@/components/BrandLogo'
import { TransactionForm } from '@/components/holdings/TransactionForm'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAutoRefresh } from '@/lib/hooks'
import { useT } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import type { TKey } from '@/lib/i18n'

interface NavItem {
  href: string
  labelKey: TKey
  icon: typeof LayoutDashboard
}

const NAV: NavItem[] = [
  { href: '/home', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/holdings', labelKey: 'nav.holdings', icon: Wallet },
  { href: '/accounts', labelKey: 'nav.accounts', icon: Briefcase },
  { href: '/history', labelKey: 'nav.history', icon: LineChart },
  { href: '/rebalance', labelKey: 'nav.rebalance', icon: Target },
  { href: '/news', labelKey: 'nav.news', icon: Newspaper },
  { href: '/assistant', labelKey: 'nav.assistant', icon: Sparkles },
  { href: '/settings', labelKey: 'nav.settings', icon: SettingsIcon },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const active = router.pathname
  const { t, locale } = useT()
  const initialized = useUi((s) => s.initialized)
  const loadFromBackend = useUi((s) => s.loadFromBackend)
  const quickTradeOpen = useUi((s) => s.quickTradeOpen)
  const quickTradeDefaultTicker = useUi((s) => s.quickTradeDefaultTicker)
  const openQuickTrade = useUi((s) => s.openQuickTrade)
  const closeQuickTrade = useUi((s) => s.closeQuickTrade)
  const bumpData = useUi((s) => s.bumpData)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    if (initialized) return
    if (typeof window === 'undefined' || !window.api) return
    void loadFromBackend()
  }, [initialized, loadFromBackend])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.api) return
    window.api.updater
      .currentVersion()
      .then(setAppVersion)
      .catch(() => undefined)
  }, [])

  useAutoRefresh()

  // Persistent in-app toast when electron-updater has pulled a new version.
  // Easier to notice than the Windows toast, and the action button quits +
  // installs + relaunches in one shot.
  const seenVersionRef = useRef<string | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api) return
    const unsubscribe = window.api.updater.onDownloaded(({ version }) => {
      if (seenVersionRef.current === version) return
      seenVersionRef.current = version
      // Read locale at toast-fire time from the Zustand store rather
      // than capturing it in the effect closure. Without this, every
      // language flip tore down + re-attached the IPC listener — and
      // worse, an in-flight download whose event fired between flips
      // could fire the toast in the wrong language. getState() is
      // synchronous and stable.
      const currentLocale = useUi.getState().locale
      toast(
        currentLocale === 'fr'
          ? `Version ${version} prete a installer`
          : `Version ${version} ready to install`,
        {
          duration: Infinity,
          action: {
            label: currentLocale === 'fr' ? 'Redemarrer' : 'Restart',
            onClick: () => {
              void window.api.updater.quitAndInstall()
            },
          },
        },
      )
    })
    return unsubscribe
  }, [])

  // Ctrl/Cmd+N opens the Quick Trade dialog from anywhere. We deliberately
  // skip when the user is typing in an input/select so we don't hijack
  // form interactions.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openQuickTrade()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openQuickTrade])

  async function handleQuickTradeSubmit(input: TransactionInput) {
    await api().transactions.create(input)
    toast.success(
      locale === 'fr'
        ? `Transaction ${input.kind === 'buy' ? 'achat' : 'vente'} ajoutee pour ${input.ticker}`
        : `${input.kind === 'buy' ? 'Buy' : 'Sell'} added for ${input.ticker}`,
    )
    bumpData()
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <aside className="w-48 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-4 py-4">
          {/* Logo: prefer the bundled PNG (renderer/public/logo.png); fall
              back to the lucide icon-in-square if the asset is missing
              so the app still looks intentional pre-icon-drop. */}
          <BrandLogo size={28} />
          <span className="text-sm font-semibold tracking-tight">
            Beta Trading Hub
          </span>
        </div>
        <nav className="flex-1 px-2 pb-2 flex flex-col gap-px">
          {NAV.map((item) => {
            const isActive =
              active === item.href || active.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
              >
                <item.icon
                  className={cn(
                    'size-3.5 transition-colors',
                    isActive
                      ? 'text-primary'
                      : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground',
                  )}
                />
                {t(item.labelKey)}
              </Link>
            )
          })}
        </nav>
        <ProfileSwitcher locale={locale} />
        <div className="px-4 py-3 text-[11px] text-sidebar-foreground/40 border-t border-sidebar-border tabular-nums">
          {appVersion ? `v${appVersion}` : 'v…'} · local-only
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      <TransactionForm
        open={quickTradeOpen}
        onClose={closeQuickTrade}
        defaultTicker={quickTradeDefaultTicker ?? undefined}
        onSubmit={handleQuickTradeSubmit}
      />
    </div>
  )
}

// Profile picker rendered above the version footer in the sidebar.
// Lists every profile and lets the user switch with a single click.
// Defaults are loaded on first render; the picker re-fetches when
// dataTick bumps (so adding/removing a profile from Settings shows
// up immediately).
function ProfileSwitcher({ locale }: { locale: 'fr' | 'en' }) {
  const initialized = useUi((s) => s.initialized)
  const dataTick = useUi((s) => s.dataTick)
  const activeProfileId = useUi((s) => s.activeProfileId)
  const setActiveProfileId = useUi((s) => s.setActiveProfileId)
  const [profiles, setProfiles] = useState<
    Array<{ id: number; name: string }>
  >([])

  useEffect(() => {
    if (!initialized) return
    let cancelled = false
    api()
      .profiles.list()
      .then((p) => {
        if (cancelled) return
        setProfiles(p)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [initialized, dataTick])

  // Hide the switcher entirely when there's only one profile — it's
  // just clutter until the user actually creates a second one (e.g.
  // for their partner). Show as soon as 2+ exist.
  if (profiles.length < 2) return null
  const active = profiles.find((p) => p.id === activeProfileId)
  return (
    <div className="px-2 py-2 border-t border-sidebar-border">
      <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 px-2 mb-1">
        {locale === 'fr' ? 'Profil' : 'Profile'}
      </div>
      <div className="flex flex-col gap-0.5">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => void setActiveProfileId(p.id)}
            className={cn(
              'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] text-left transition-colors',
              p.id === active?.id
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60',
            )}
          >
            <UserCircle2
              className={cn(
                'size-3.5 shrink-0',
                p.id === active?.id
                  ? 'text-primary'
                  : 'text-sidebar-foreground/60',
              )}
            />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
