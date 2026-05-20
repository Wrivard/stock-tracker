import Head from 'next/head'
import { toast } from 'sonner'
import { TrendingUp, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Portfolio Tracker</title>
      </Head>
      <main className="min-h-screen flex items-center justify-center p-8 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="text-primary size-5" />
              <CardTitle>Portfolio Tracker</CardTitle>
            </div>
            <CardDescription>
              Suivi local de ton portefeuille d'actions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Stack initialisee : Nextron + Tailwind 4 + shadcn/ui. Pret pour les
              prochaines etapes (DB locale, holdings, dashboard, etc.).
            </p>
            <div className="flex gap-2">
              <Button onClick={() => toast.success('Toast Sonner fonctionnel !')}>
                <Sparkles />
                Tester un toast
              </Button>
              <Button
                variant="outline"
                onClick={() => toast('Bouton secondaire OK')}
              >
                Variant outline
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
