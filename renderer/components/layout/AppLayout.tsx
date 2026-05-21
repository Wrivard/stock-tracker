import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, type ReactNode } from 'react'
import {
  LayoutDashboard,
  LineChart,
  Newspaper,
  Settings as SettingsIcon,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { AppHeader } from '@/components/layout/AppHeader'
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
  const { t } = useT()
  const initialized = useUi((s) => s.initialized)
  const loadFromBackend = useUi((s) => s.loadFromBackend)

  // Hydrate UI store from backend settings on first mount. Runs once.
  useEffect(() => {
    if (initialized) return
    if (typeof window === 'undefined' || !window.api) return
    void loadFromBackend()
  }, [initialized, loadFromBackend])

  useAutoRefresh()

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-56 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-sidebar-border">
          <TrendingUp className="size-5 text-sidebar-primary" />
          <span className="font-semibold tracking-tight">Stock Tracker</span>
        </div>
        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
          {NAV.map((item) => {
            const isActive =
              active === item.href || active.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
              >
                <item.icon className="size-4" />
                {t(item.labelKey)}
              </Link>
            )
          })}
        </nav>
        <div className="px-4 py-3 text-xs text-sidebar-foreground/50 border-t border-sidebar-border">
          v0.1.0 — local-only
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
