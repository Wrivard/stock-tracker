import Head from 'next/head'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  Download,
  DownloadCloud,
  Eye,
  EyeOff,
  ExternalLink,
  FolderOpen,
  HardDriveDownload,
  RotateCcw,
  Save,
} from 'lucide-react'

import type { BackupInfo } from '../../main/services/backup'
import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

export default function SettingsPage() {
  const { t, locale } = useT()
  const initialized = useUi((s) => s.initialized)
  const displayCurrency = useUi((s) => s.displayCurrency)
  const setDisplayCurrency = useUi((s) => s.setDisplayCurrency)
  const setLocale = useUi((s) => s.setLocale)
  const refreshIntervalSec = useUi((s) => s.refreshIntervalSec)
  const setRefreshIntervalSec = useUi((s) => s.setRefreshIntervalSec)
  const apiKeyStatus = useUi((s) => s.apiKeyStatus)
  const refreshApiKeyStatus = useUi((s) => s.refreshApiKeyStatus)
  const { theme, setTheme } = useTheme()

  const [finnhubKey, setFinnhubKey] = useState('')
  const [twelvedataKey, setTwelvedataKey] = useState('')
  const [showFinnhub, setShowFinnhub] = useState(false)
  const [showTwelvedata, setShowTwelvedata] = useState(false)
  const [savingFinnhub, setSavingFinnhub] = useState(false)
  const [savingTwelvedata, setSavingTwelvedata] = useState(false)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [backupBusy, setBackupBusy] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('')
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateState, setUpdateState] = useState<
    | { status: 'idle' }
    | { status: 'up-to-date' }
    | { status: 'available'; version: string }
    | { status: 'downloaded'; version: string }
    | { status: 'error'; message: string }
    | { status: 'dev'; message: string }
  >({ status: 'idle' })

  useEffect(() => {
    if (!initialized) return
    Promise.all([
      api().settings.get('api.finnhubKey'),
      api().settings.get('api.twelvedataKey'),
      api().backup.list(),
      api().updater.currentVersion(),
    ])
      .then(([f, t2, bs, v]) => {
        if (f) setFinnhubKey(f)
        if (t2) setTwelvedataKey(t2)
        setBackups(bs)
        setAppVersion(v)
      })
      .catch((err: Error) => toast.error(err.message))
  }, [initialized])

  async function handleCheckUpdate() {
    setUpdateBusy(true)
    try {
      const result = await api().updater.check()
      if (result.status === 'up-to-date') {
        setUpdateState({ status: 'up-to-date' })
        toast.success(t('settings.upToDate'))
      } else if (result.status === 'available') {
        setUpdateState({ status: 'available', version: result.version })
        toast.info(
          t('settings.updateAvailable', { version: result.version }),
        )
      } else if (result.status === 'dev') {
        setUpdateState({ status: 'dev', message: result.message })
        toast.info(result.message)
      } else {
        setUpdateState({ status: 'error', message: result.message })
        toast.error(result.message)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdateBusy(false)
    }
  }

  async function handleRestartToInstall() {
    try {
      await api().updater.quitAndInstall()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function refreshBackups() {
    try {
      setBackups(await api().backup.list())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleBackupNow() {
    setBackupBusy(true)
    try {
      const res = await api().backup.runNow()
      if (res.created) {
        toast.success(
          locale === 'fr'
            ? 'Sauvegarde enregistree'
            : 'Backup saved',
        )
      } else {
        toast.info(
          locale === 'fr'
            ? "Sauvegarde du jour deja presente"
            : 'A backup for today already exists',
        )
      }
      await refreshBackups()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBackupBusy(false)
    }
  }

  async function handleExport() {
    setBackupBusy(true)
    try {
      const filePath = await api().backup.exportTo()
      if (filePath) {
        toast.success(
          locale === 'fr' ? `Exporte vers ${filePath}` : `Exported to ${filePath}`,
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBackupBusy(false)
    }
  }

  async function handleOpenFolder() {
    try {
      await api().backup.openFolder()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(2)} MB`
  }

  async function saveFinnhub() {
    setSavingFinnhub(true)
    try {
      await api().settings.setApiKey('finnhub', finnhubKey)
      await refreshApiKeyStatus()
      toast.success(
        locale === 'fr' ? 'Cle Finnhub enregistree' : 'Finnhub key saved',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingFinnhub(false)
    }
  }

  async function saveTwelvedata() {
    setSavingTwelvedata(true)
    try {
      await api().settings.setApiKey('twelvedata', twelvedataKey)
      await refreshApiKeyStatus()
      toast.success(
        locale === 'fr' ? 'Cle Twelve Data enregistree' : 'Twelve Data key saved',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingTwelvedata(false)
    }
  }

  function openLink(url: string) {
    void api().shell.openExternal(url)
  }

  return (
    <>
      <Head>
        <title>{`${t('settings.title')} · Portfolio Tracker`}</title>
      </Head>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {t('settings.title')}
          </h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.apiKeys')}</CardTitle>
            <CardDescription>{t('settings.apiKeysHelp')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="key-finnhub">{t('settings.finnhubKey')}</Label>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={apiKeyStatus.finnhub ? 'default' : 'destructive'}
                  >
                    {apiKeyStatus.finnhub
                      ? locale === 'fr' ? 'Configuree' : 'Configured'
                      : locale === 'fr' ? 'Absente' : 'Missing'}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openLink('https://finnhub.io/register')}
                  >
                    finnhub.io <ExternalLink className="size-3" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  id="key-finnhub"
                  type={showFinnhub ? 'text' : 'password'}
                  value={finnhubKey}
                  onChange={(e) => setFinnhubKey(e.target.value)}
                  placeholder="d0..."
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowFinnhub((v) => !v)}
                  aria-label="toggle visibility"
                >
                  {showFinnhub ? <EyeOff /> : <Eye />}
                </Button>
                <Button onClick={saveFinnhub} disabled={savingFinnhub}>
                  <Save />
                  {savingFinnhub ? t('common.refreshing') : t('common.save')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {locale === 'fr'
                  ? "Quotes temps reel, profils d'entreprise, news. Free tier : 60 calls/min."
                  : 'Real-time quotes, company profiles, news. Free tier: 60 calls/min.'}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="key-twelve">{t('settings.twelvedataKey')}</Label>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={apiKeyStatus.twelvedata ? 'default' : 'destructive'}
                  >
                    {apiKeyStatus.twelvedata
                      ? locale === 'fr' ? 'Configuree' : 'Configured'
                      : locale === 'fr' ? 'Absente' : 'Missing'}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openLink('https://twelvedata.com/register')}
                  >
                    twelvedata.com <ExternalLink className="size-3" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  id="key-twelve"
                  type={showTwelvedata ? 'text' : 'password'}
                  value={twelvedataKey}
                  onChange={(e) => setTwelvedataKey(e.target.value)}
                  placeholder="abc..."
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowTwelvedata((v) => !v)}
                  aria-label="toggle visibility"
                >
                  {showTwelvedata ? <EyeOff /> : <Eye />}
                </Button>
                <Button onClick={saveTwelvedata} disabled={savingTwelvedata}>
                  <Save />
                  {savingTwelvedata ? t('common.refreshing') : t('common.save')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {locale === 'fr'
                  ? 'Prix historiques (chandelles journalieres). Free tier : 800 requetes/jour, 8 par minute.'
                  : 'Historical prices (daily candles). Free tier: 800/day, 8/min.'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.preferences')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('settings.displayCurrency')}</Label>
              <Select
                value={displayCurrency}
                onValueChange={(v) =>
                  setDisplayCurrency(v as 'CAD' | 'USD')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.locale')}</Label>
              <Select
                value={locale}
                onValueChange={(v) => setLocale(v as 'fr' | 'en')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Francais</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.theme')}</Label>
              <Select
                value={theme === 'dark' ? 'dark' : 'light'}
                onValueChange={(v) => setTheme(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">
                    {locale === 'fr' ? 'Sombre' : 'Dark'}
                  </SelectItem>
                  <SelectItem value="light">
                    {locale === 'fr' ? 'Clair' : 'Light'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="refresh-interval">
                {t('settings.refreshIntervalSec')}
              </Label>
              <Input
                id="refresh-interval"
                type="number"
                min={0}
                step={30}
                value={refreshIntervalSec}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v) && v >= 0) {
                    void setRefreshIntervalSec(v)
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                {locale === 'fr'
                  ? '0 = desactive. Recommande : 300 (5 min).'
                  : '0 = disabled. Recommended: 300 (5 min).'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>{t('settings.updates')}</CardTitle>
                <CardDescription>{t('settings.updatesHelp')}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {appVersion && (
                  <Badge variant="secondary" className="font-mono">
                    v{appVersion}
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckUpdate}
                  disabled={updateBusy}
                >
                  <DownloadCloud />
                  {updateBusy ? t('settings.checking') : t('settings.checkUpdates')}
                </Button>
              </div>
            </div>
          </CardHeader>
          {updateState.status !== 'idle' && (
            <CardContent>
              {updateState.status === 'up-to-date' && (
                <p className="text-sm text-positive">
                  {t('settings.upToDate')}
                </p>
              )}
              {updateState.status === 'available' && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">
                    {t('settings.updateAvailable', { version: updateState.version })}
                  </p>
                  <Button size="sm" onClick={handleRestartToInstall}>
                    <RotateCcw />
                    {t('settings.restartToInstall')}
                  </Button>
                </div>
              )}
              {updateState.status === 'dev' && (
                <p className="text-xs text-muted-foreground">
                  {updateState.message}
                </p>
              )}
              {updateState.status === 'error' && (
                <p className="text-sm text-destructive">{updateState.message}</p>
              )}
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>{t('settings.backups')}</CardTitle>
                <CardDescription>{t('settings.backupsHelp')}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackupNow}
                  disabled={backupBusy}
                >
                  <HardDriveDownload />
                  {t('settings.backupNow')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={backupBusy}
                >
                  <Download />
                  {t('settings.exportSqlite')}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleOpenFolder}>
                  <FolderOpen />
                  {t('settings.openBackupFolder')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {backups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('settings.noBackupsYet')}
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {backups.map((b) => (
                  <li
                    key={b.fileName}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono tabular-nums">{b.date}</span>
                      <span className="text-muted-foreground text-xs truncate">
                        {b.fileName}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatBytes(b.sizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {locale === 'fr' ? 'A propos' : 'About'}
            </CardTitle>
            <CardDescription>
              {locale === 'fr'
                ? 'Donnees stockees localement dans une base SQLite. Aucune transmission vers un serveur tiers en dehors des APIs de marche.'
                : 'Data stored locally in a SQLite database. No transmission outside market APIs.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-disc list-inside space-y-1">
              <li>
                {locale === 'fr' ? 'Version' : 'Version'} 0.1.0
              </li>
              <li>
                {locale === 'fr'
                  ? 'Fournisseurs : Finnhub (quotes, profiles, news), Twelve Data (historique), Frankfurter (FX gratuit).'
                  : 'Providers: Finnhub (quotes, profiles, news), Twelve Data (history), Frankfurter (free FX).'}
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
