import Link from 'next/link'
import { useRouter } from 'next/router'
import type { ReactNode } from 'react'
import {
  LayoutDashboard,
  LineChart,
  Newspaper,
  Settings as SettingsIcon,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
}

const NAV: NavItem[] = [
  { href: '/home', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/holdings', label: 'Holdings', icon: Wallet },
  { href: '/history', label: 'Historique', icon: LineChart },
  { href: '/rebalance', label: 'Rebalance', icon: Target },
  { href: '/news', label: 'News', icon: Newspaper },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const active = router.pathname

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
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="px-4 py-3 text-xs text-sidebar-foreground/50 border-t border-sidebar-border">
          v0.1.0 — local-only
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
