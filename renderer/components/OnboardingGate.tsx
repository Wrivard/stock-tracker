import { useEffect, useState, type ReactNode } from 'react'

import { api } from '@/lib/api'
import { OnboardingWizard } from '@/components/OnboardingWizard'

interface OnboardingGateProps {
  children: ReactNode
}

// Gate: on first launch, hide the rest of the UI behind a 5-step wizard.
// State lives in the `onboarding.completed` setting so the gate never
// re-appears once the user has finished (or skipped) the flow once.
export function OnboardingGate({ children }: OnboardingGateProps) {
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.api) {
      // Static-export pre-render: assume "ready" so the markup doesn't
      // hold the wizard, which would otherwise flash through hydration.
      setNeedsOnboarding(false)
      return
    }
    api()
      .settings.get('onboarding.completed')
      .then((v) => setNeedsOnboarding(v !== '1'))
      .catch(() => setNeedsOnboarding(false))
  }, [])

  const handleComplete = async () => {
    await api().settings.set('onboarding.completed', '1')
    setNeedsOnboarding(false)
  }

  if (needsOnboarding === null) {
    // brief no-op while we ask the main process; avoids onboarding flash
    return null
  }

  if (needsOnboarding) {
    return <OnboardingWizard onComplete={handleComplete} />
  }

  return <>{children}</>
}
