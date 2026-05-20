import type { AppProps } from 'next/app'
import { ThemeProvider } from 'next-themes'

import { AppLayout } from '@/components/layout/AppLayout'
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
      <AppLayout>
        <Component {...pageProps} />
      </AppLayout>
      <Toaster />
    </ThemeProvider>
  )
}

export default MyApp
