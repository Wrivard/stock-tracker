import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, Newspaper } from 'lucide-react'

import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface NewsItemView {
  id: string
  symbol: string
  headline: string
  summary: string
  source: string
  url: string
  publishedAt: number
  imageUrl: string | null
  tickerName: string | null
}

const ALL = '__all__'

export default function NewsPage() {
  const { t, locale } = useT()
  const refreshTick = useUi((s) => s.refreshTick)
  const initialized = useUi((s) => s.initialized)

  const [items, setItems] = useState<NewsItemView[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>(ALL)

  const reload = async () => {
    setLoading(true)
    try {
      const data = await api().market.portfolioNews()
      setItems(data.items)
      setErrors(data.errors)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!initialized) return
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, refreshTick])

  const tickers = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) set.add(item.symbol)
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    if (filter === ALL) return items
    return items.filter((i) => i.symbol === filter)
  }, [items, filter])

  async function openLink(url: string) {
    try {
      await api().shell.openExternal(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <Head>
        <title>{t('news.title')} · Portfolio Tracker</title>
      </Head>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('news.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {locale === 'fr'
                ? 'Articles recents Finnhub par ticker du portefeuille.'
                : 'Recent Finnhub articles for your portfolio tickers.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('news.allTickers')}</SelectItem>
                {tickers.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {Object.entries(errors).length > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {locale === 'fr' ? 'Avertissements' : 'Warnings'}
              </CardTitle>
              <CardDescription className="text-xs">
                {Object.entries(errors)
                  .map(([sym, msg]) => `${sym}: ${msg}`)
                  .join(' · ')}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {loading && filtered.length === 0 && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-md" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Newspaper className="size-4" />
                {t('news.empty')}
              </CardTitle>
            </CardHeader>
          </Card>
        )}

        <div className="space-y-3">
          {filtered.map((n) => (
            <Card key={n.id} className="hover:border-foreground/30 transition-colors">
              <div className="flex gap-4 p-4">
                {n.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={n.imageUrl}
                    alt=""
                    className="w-28 h-20 object-cover rounded-md flex-shrink-0 bg-muted"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="font-mono">
                      {n.symbol}
                    </Badge>
                    <span>{n.source}</span>
                    <span>·</span>
                    <span>{new Date(n.publishedAt).toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA')}</span>
                  </div>
                  <h3 className="font-medium leading-snug">{n.headline}</h3>
                  {n.summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {n.summary}
                    </p>
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0 h-auto"
                    onClick={() => openLink(n.url)}
                  >
                    {locale === 'fr' ? "Lire l'article" : 'Read article'}
                    <ExternalLink className="size-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
