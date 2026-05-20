import Head from 'next/head'

export default function HistoryPage() {
  return (
    <>
      <Head>
        <title>Historique · Portfolio Tracker</title>
      </Head>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold tracking-tight">Historique</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Snapshots quotidiens + chart d'evolution — etape 5.
        </p>
      </div>
    </>
  )
}
