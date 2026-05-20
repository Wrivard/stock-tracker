import Head from 'next/head'

export default function NewsPage() {
  return (
    <>
      <Head>
        <title>News · Portfolio Tracker</title>
      </Head>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold tracking-tight">News</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Feed Finnhub par ticker — etape 7.
        </p>
      </div>
    </>
  )
}
