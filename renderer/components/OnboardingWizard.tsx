import { useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowRight,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  TrendingUp,
} from 'lucide-react'

import type { TransactionInput } from '../../main/db/types'
import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TransactionForm } from '@/components/holdings/TransactionForm'

interface OnboardingWizardProps {
  onComplete: () => Promise<void>
}

type Step = 'welcome' | 'keys' | 'tx' | 'targets' | 'done'

const STEPS: Step[] = ['welcome', 'keys', 'tx', 'targets', 'done']

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t, locale } = useT()
  const refreshApiKeyStatus = useUi((s) => s.refreshApiKeyStatus)
  const bumpData = useUi((s) => s.bumpData)
  const [step, setStep] = useState<Step>('welcome')
  const [finishing, setFinishing] = useState(false)
  const [txOpen, setTxOpen] = useState(false)
  const [txCreated, setTxCreated] = useState(false)

  // Step 2 — keys
  const [finnhub, setFinnhub] = useState('')
  const [twelvedata, setTwelvedata] = useState('')
  const [showF, setShowF] = useState(false)
  const [showT, setShowT] = useState(false)
  const [savingKeys, setSavingKeys] = useState(false)

  function go(next: Step) {
    setStep(next)
  }

  async function saveKeysAndNext() {
    setSavingKeys(true)
    try {
      if (finnhub.trim()) await api().settings.setApiKey('finnhub', finnhub.trim())
      if (twelvedata.trim())
        await api().settings.setApiKey('twelvedata', twelvedata.trim())
      await refreshApiKeyStatus()
      if (finnhub.trim() || twelvedata.trim()) {
        toast.success(locale === 'fr' ? 'Cles enregistrees' : 'Keys saved')
      }
      go('tx')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingKeys(false)
    }
  }

  async function handleTxSubmit(input: TransactionInput) {
    await api().transactions.create(input)
    toast.success(
      locale === 'fr'
        ? `${input.ticker} ajoute !`
        : `${input.ticker} added!`,
    )
    setTxCreated(true)
    setTxOpen(false)
    bumpData()
  }

  async function finish() {
    setFinishing(true)
    try {
      await onComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      setFinishing(false)
    }
  }

  function openExternal(url: string) {
    void api().shell.openExternal(url)
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="fixed inset-0 bg-background text-foreground flex items-center justify-center p-6 overflow-auto">
      <div className="max-w-xl w-full">
        {/* Header with logo + progress dots */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-md bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
              <TrendingUp className="size-5 text-primary" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">Stock Tracker</div>
              <div className="text-[11px] text-muted-foreground">v0.1.0</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  'size-1.5 rounded-full transition-colors',
                  i <= stepIndex ? 'bg-primary' : 'bg-muted',
                )}
              />
            ))}
          </div>
        </header>

        {step === 'welcome' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t('onboarding.welcome.title')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('onboarding.welcome.body')}
              </p>
            </div>
            <Bullets
              items={[
                t('onboarding.keys.title'),
                t('onboarding.tx.title'),
                t('onboarding.targets.title'),
              ]}
            />
            <div className="flex gap-2 pt-2">
              <Button onClick={() => go('keys')}>
                {t('onboarding.start')}
                <ArrowRight className="size-3.5" />
              </Button>
              <Button variant="ghost" onClick={() => go('done')}>
                {t('onboarding.skip')}
              </Button>
            </div>
          </div>
        )}

        {step === 'keys' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">
                {t('onboarding.keys.title')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('onboarding.keys.body')}
              </p>
            </div>
            <div className="space-y-4">
              <KeyInput
                label="Finnhub"
                helpUrl="https://finnhub.io/register"
                value={finnhub}
                onChange={setFinnhub}
                show={showF}
                onToggle={() => setShowF((v) => !v)}
              />
              <KeyInput
                label="Twelve Data"
                helpUrl="https://twelvedata.com/register"
                value={twelvedata}
                onChange={setTwelvedata}
                show={showT}
                onToggle={() => setShowT((v) => !v)}
              />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => go('tx')} disabled={savingKeys}>
                {t('onboarding.skip')}
              </Button>
              <Button onClick={saveKeysAndNext} disabled={savingKeys}>
                {savingKeys ? '…' : t('onboarding.next')}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
            <div className="pt-2 text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-1">
                <ExternalLink className="size-3" />
                <button
                  type="button"
                  className="hover:text-primary underline-offset-2 hover:underline"
                  onClick={() => openExternal('https://finnhub.io/register')}
                >
                  S&apos;inscrire a Finnhub (gratuit)
                </button>
              </p>
              <p className="flex items-center gap-1">
                <ExternalLink className="size-3" />
                <button
                  type="button"
                  className="hover:text-primary underline-offset-2 hover:underline"
                  onClick={() => openExternal('https://twelvedata.com/register')}
                >
                  S&apos;inscrire a Twelve Data (gratuit)
                </button>
              </p>
            </div>
          </div>
        )}

        {step === 'tx' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">
                {t('onboarding.tx.title')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('onboarding.tx.body')}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
              {txCreated ? (
                <div className="space-y-2">
                  <Check className="size-8 text-positive mx-auto" />
                  <p className="text-sm">
                    {locale === 'fr'
                      ? 'Position ajoutee.'
                      : 'Position added.'}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {locale === 'fr'
                      ? 'Ticker, quantite, prix moyen, devise — c\'est tout.'
                      : 'Ticker, quantity, average price, currency — that\'s it.'}
                  </p>
                  <Button onClick={() => setTxOpen(true)}>
                    <Plus className="size-3.5" />
                    {locale === 'fr'
                      ? 'Ajouter une transaction'
                      : 'Add a transaction'}
                  </Button>
                </>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => go('targets')}>
                {t('onboarding.skip')}
              </Button>
              <Button onClick={() => go('targets')}>
                {t('onboarding.next')}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
            <TransactionForm
              open={txOpen}
              onClose={() => setTxOpen(false)}
              onSubmit={handleTxSubmit}
            />
          </div>
        )}

        {step === 'targets' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">
                {t('onboarding.targets.title')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('onboarding.targets.body')}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              {locale === 'fr'
                ? "Les cibles se definissent dans l'onglet Reequilibrage une fois l'app ouverte. Tu peux y revenir n'importe quand."
                : 'Targets are set in the Rebalance tab once the app is open. You can revisit anytime.'}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => go('done')}>
                {t('onboarding.next')}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="size-12 rounded-full bg-positive/15 flex items-center justify-center">
                <Check className="size-6 text-positive" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight">
                {t('onboarding.done.title')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('onboarding.done.body')}
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={finish} disabled={finishing}>
                {finishing ? '…' : t('onboarding.finish')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-2.5">
          <span className="size-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
            {i + 1}
          </span>
          {item}
        </li>
      ))}
    </ul>
  )
}

interface KeyInputProps {
  label: string
  helpUrl: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
}

function KeyInput({ label, value, onChange, show, onToggle }: KeyInputProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="…"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onToggle}
          aria-label="toggle visibility"
        >
          {show ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </div>
  )
}
