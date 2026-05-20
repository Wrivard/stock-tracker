import Head from 'next/head'
import { LineChart, PieChart, Wallet } from 'lucide-react'

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
        <title>Dashboard · Portfolio Tracker</title>
      </Head>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vue d'ensemble du portefeuille. Les graphiques et indicateurs
            apparaitront aux etapes 4 et 5.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="size-4 text-primary" />
                Valeur totale
              </CardTitle>
              <CardDescription>A integrer (etape 3 : market-api)</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tabular-nums">
              —
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChart className="size-4 text-primary" />
                Allocation par secteur
              </CardTitle>
              <CardDescription>Pie chart (etape 4)</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Aucune donnee — ajoute des positions dans Holdings.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LineChart className="size-4 text-primary" />
                Historique
              </CardTitle>
              <CardDescription>
                Line chart des snapshots (etape 5)
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Le premier snapshot sera enregistre quand l'api de marche sera
              branchee.
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
