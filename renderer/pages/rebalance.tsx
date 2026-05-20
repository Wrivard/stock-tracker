import Head from 'next/head'

export default function RebalancePage() {
  return (
    <>
      <Head>
        <title>Rebalance · Portfolio Tracker</title>
      </Head>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold tracking-tight">Rebalance</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Cibles par secteur + suggestions d'achat/vente — etape 6.
        </p>
      </div>
    </>
  )
}
