import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  LayoutDashboard,
  LineChart,
  Newspaper,
  Settings as SettingsIcon,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import type { TransactionInput } from '../../../main/db/types'
import { AppHeader } from '@/components/layout/AppHeader'
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
  { href: '/history', labelKey: 'nav.history', icon: LineChart },
  { href: '/rebalance', labelKey: 'nav.rebalance', icon: Target },
  { href: '/news', labelKey: 'nav.news', icon: Newspaper },
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

  useEffect(() => {
    if (initialized) return
    if (typeof window === 'undefined' || !window.api) return
    void loadFromBackend()
  }, [initialized, loadFromBackend])

  useAutoRefresh()

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
          <div className="size-7 rounded-md bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
            <TrendingUp className="size-4 text-primary" />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Stock Tracker
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
        <div className="px-4 py-3 text-[11px] text-sidebar-foreground/40 border-t border-sidebar-border tabular-nums">
          v0.1.0 · local-only
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
