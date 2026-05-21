import type { AppProps } from 'next/app'
import { ThemeProvider } from 'next-themes'

import { AppLayout } from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { OnboardingGate } from '@/components/OnboardingGate'
import { Toaster } from '@/components/ui/sonner'
import '../styles/globals.css'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <ErrorBoundary>
        <OnboardingGate>
          <AppLayout>
            <Component {...pageProps} />
          </AppLayout>
        </OnboardingGate>
      </ErrorBoundary>
      <Toaster />
    </ThemeProvider>
  )
}

export default MyApp
