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
  FileSpreadsheet,
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

  // The input fields default to EMPTY even when a key is already stored.
  // Showing the existing key (pre-filled with bullets) only confused the
  // user into thinking they had to re-enter every launch. Instead, the
  // badge below the label surfaces "Configurée · ····86tg" so they know
  // the key is saved; pasting a value into the empty input REPLACES it.
  const [finnhubKey, setFinnhubKey] = useState('')
  const [twelvedataKey, setTwelvedataKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showFinnhub, setShowFinnhub] = useState(false)
  const [showTwelvedata, setShowTwelvedata] = useState(false)
  const [showOpenai, setShowOpenai] = useState(false)
  const [savingFinnhub, setSavingFinnhub] = useState(false)
  const [savingTwelvedata, setSavingTwelvedata] = useState(false)
  const [savingOpenai, setSavingOpenai] = useState(false)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [backupBusy, setBackupBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const bumpData = useUi((s) => s.bumpData)
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
  // Tracks the version that finished downloading. quitAndInstall is a
  // no-op until the file is on disk, so we use this to gate the
  // "Restart to install" button.
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null)

  useEffect(() => {
    if (!initialized) return
    Promise.all([api().backup.list(), api().updater.currentVersion()])
      .then(([bs, v]) => {
        setBackups(bs)
        setAppVersion(v)
      })
      .catch((err: Error) => toast.error(err.message))
  }, [initialized])

  // Subscribe to the main process "downloaded" signal pushed by
  // electron-updater. Without this, the Restart button could be clicked
  // before the .exe finishes downloading and quitAndInstall would
  // silently no-op.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api) return
    const off = window.api.updater.onDownloaded(({ version }) => {
      setDownloadedVersion(version)
      setUpdateState((prev) => {
        if (prev.status === 'available' || prev.status === 'idle') {
          return { status: 'downloaded', version }
        }
        return prev
      })
    })
    return off
  }, [])

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

  async function handleImportQuestrade() {
    setImportBusy(true)
    try {
      const result = await api().importBroker.questrade()
      if (result.canceled) {
        toast.info(t('import.canceled'))
        return
      }
      const { summary } = result
      toast.success(
        t('import.summary', {
          imported: summary.imported,
          existingTrades: summary.existingTrades,
          dividendsImported: summary.dividendsImported,
          skippedInvalid: summary.skippedInvalid,
        }),
      )
      if (summary.newTickers.length > 0) {
        toast.info(
          t('import.newTickers', {
            n: summary.newTickers.length,
            list: summary.newTickers.slice(0, 10).join(', ') +
              (summary.newTickers.length > 10 ? '…' : ''),
          }),
        )
      }
      if (summary.skippedInvalid > 0 && summary.invalidReasons.length > 0) {
        toast.warning(summary.invalidReasons.join(' · '))
      }
      bumpData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setImportBusy(false)
    }
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(2)} MB`
  }

  interface KeyRowProps {
    label: string
    configured: boolean
    tail: string | null
    registerUrl: string
    registerLabel: string
    openLink: (url: string) => void
    locale: 'fr' | 'en'
    value: string
    onChange: (v: string) => void
    show: boolean
    onToggleShow: () => void
    saving: boolean
    onSave: () => void
    hint: string
    inputId: string
  }

  function KeyRow({
    label,
    configured,
    tail,
    registerUrl,
    registerLabel,
    openLink,
    locale,
    value,
    onChange,
    show,
    onToggleShow,
    saving,
    onSave,
    hint,
    inputId,
  }: KeyRowProps) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label htmlFor={inputId}>{label}</Label>
            {configured ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {locale === 'fr' ? 'Configuree' : 'Configured'}
                {tail ? ` · ····${tail}` : ''}
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px]">
                {locale === 'fr' ? 'Absente' : 'Missing'}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openLink(registerUrl)}
          >
            {registerLabel}
            <ExternalLink className="size-3" />
          </Button>
        </div>
        {/* min-w-0 on the input wrapper so it can shrink past the Save
            button's min-content width when the viewport is narrow. Without
            it the Save button text ("Enregistrer" / "Remplacer") forces
            the input to overflow the row. */}
        <div className="flex gap-2 flex-wrap">
          <Input
            id={inputId}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-w-0 flex-1 basis-40"
            placeholder={
              configured
                ? locale === 'fr'
                  ? 'Coller une nouvelle cle pour remplacer…'
                  : 'Paste a new key to replace…'
                : locale === 'fr'
                  ? 'Coller ta cle ici…'
                  : 'Paste your key here…'
            }
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onToggleShow}
            aria-label="toggle visibility"
            disabled={!value}
          >
            {show ? <EyeOff /> : <Eye />}
          </Button>
          <Button onClick={onSave} disabled={saving || !value.trim()}>
            <Save />
            {saving
              ? '…'
              : configured
                ? locale === 'fr'
                  ? 'Remplacer'
                  : 'Replace'
                : locale === 'fr'
                  ? 'Enregistrer'
                  : 'Save'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    )
  }

  async function saveFinnhub() {
    if (!finnhubKey.trim()) return
    setSavingFinnhub(true)
    try {
      await api().settings.setApiKey('finnhub', finnhubKey.trim())
      await refreshApiKeyStatus()
      setFinnhubKey('') // Clear after save; badge below will show "Configurée"
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
    if (!twelvedataKey.trim()) return
    setSavingTwelvedata(true)
    try {
      await api().settings.setApiKey('twelvedata', twelvedataKey.trim())
      await refreshApiKeyStatus()
      setTwelvedataKey('')
      toast.success(
        locale === 'fr' ? 'Cle Twelve Data enregistree' : 'Twelve Data key saved',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingTwelvedata(false)
    }
  }

  async function saveOpenai() {
    if (!openaiKey.trim()) return
    setSavingOpenai(true)
    try {
      await api().settings.setApiKey('openai', openaiKey.trim())
      await refreshApiKeyStatus()
      setOpenaiKey('')
      toast.success(
        locale === 'fr' ? 'Cle OpenAI enregistree' : 'OpenAI key saved',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingOpenai(false)
    }
  }

  function openLink(url: string) {
    void api().shell.openExternal(url)
  }

  return (
    <>
      <Head>
        <title>{`${t('settings.title')} · Beta Trading Hub`}</title>
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
            <KeyRow
              label={t('settings.finnhubKey')}
              configured={apiKeyStatus.finnhub}
              tail={apiKeyStatus.finnhubTail}
              registerUrl="https://finnhub.io/register"
              registerLabel="finnhub.io"
              openLink={openLink}
              locale={locale}
              value={finnhubKey}
              onChange={setFinnhubKey}
              show={showFinnhub}
              onToggleShow={() => setShowFinnhub((v) => !v)}
              saving={savingFinnhub}
              onSave={saveFinnhub}
              hint={
                locale === 'fr'
                  ? "Quotes temps reel, profils d'entreprise, news. Free tier : 60 calls/min."
                  : 'Real-time quotes, company profiles, news. Free tier: 60 calls/min.'
              }
              inputId="key-finnhub"
            />

            <Separator />

            <KeyRow
              label={t('settings.twelvedataKey')}
              configured={apiKeyStatus.twelvedata}
              tail={apiKeyStatus.twelvedataTail}
              registerUrl="https://twelvedata.com/register"
              registerLabel="twelvedata.com"
              openLink={openLink}
              locale={locale}
              value={twelvedataKey}
              onChange={setTwelvedataKey}
              show={showTwelvedata}
              onToggleShow={() => setShowTwelvedata((v) => !v)}
              saving={savingTwelvedata}
              onSave={saveTwelvedata}
              hint={
                locale === 'fr'
                  ? 'Prix historiques (chandelles journalieres). Free tier : 800 requetes/jour, 8 par minute.'
                  : 'Historical prices (daily candles). Free tier: 800/day, 8/min.'
              }
              inputId="key-twelve"
            />

            <Separator />

            <KeyRow
              label={t('settings.openaiKey')}
              configured={apiKeyStatus.openai}
              tail={apiKeyStatus.openaiTail}
              registerUrl="https://platform.openai.com/api-keys"
              registerLabel="platform.openai.com"
              openLink={openLink}
              locale={locale}
              value={openaiKey}
              onChange={setOpenaiKey}
              show={showOpenai}
              onToggleShow={() => setShowOpenai((v) => !v)}
              saving={savingOpenai}
              onSave={saveOpenai}
              hint={t('settings.openaiHint')}
              inputId="key-openai"
            />
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
                key={displayCurrency}
                value={displayCurrency}
                onValueChange={(v) => {
                  if (v === 'USD' || v === 'CAD') setDisplayCurrency(v)
                }}
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
                key={locale}
                value={locale}
                onValueChange={(v) => {
                  if (v === 'fr' || v === 'en') setLocale(v)
                }}
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
                  {downloadedVersion === updateState.version ? (
                    <Button size="sm" onClick={handleRestartToInstall}>
                      <RotateCcw />
                      {t('settings.restartToInstall')}
                    </Button>
                  ) : (
                    <Button size="sm" disabled>
                      <RotateCcw className="animate-spin" />
                      {t('settings.downloading')}
                    </Button>
                  )}
                </div>
              )}
              {updateState.status === 'downloaded' && (
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
                <CardTitle>{t('import.title')}</CardTitle>
                <CardDescription>{t('import.help')}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportQuestrade}
                disabled={importBusy}
              >
                <FileSpreadsheet />
                {importBusy ? t('import.questradeBusy') : t('import.questradeButton')}
              </Button>
            </div>
          </CardHeader>
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
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="font-mono tabular-nums shrink-0">{b.date}</span>
                      <span
                        className="text-muted-foreground text-xs truncate min-w-0"
                        title={b.fileName}
                      >
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
                {locale === 'fr' ? 'Version' : 'Version'} {appVersion || '…'}
              </li>
              <li>
                {locale === 'fr'
                  ? 'Fournisseurs : Yahoo Finance (quotes, historique, news, ETF), Finnhub (news fallback), Twelve Data (historique fallback), Frankfurter (FX gratuit), OpenAI (recap IA, optionnel).'
                  : 'Providers: Yahoo Finance (quotes, history, news, ETFs), Finnhub (news fallback), Twelve Data (history fallback), Frankfurter (free FX), OpenAI (AI recap, optional).'}
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
