import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: string
}

// Renderer-side safety net: catches any uncaught error during render and
// shows a visible panel instead of leaving a blank Electron window. The
// panel includes the message + stack so the user can copy-paste it back
// when reporting issues.
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null, info: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: '' }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[renderer-error]', error, info)
    this.setState({ error, info: info.componentStack ?? '' })
  }

  reset = () => {
    this.setState({ error: null, info: '' })
  }

  reload = () => {
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    const err = this.state.error
    return (
      <div className="min-h-screen bg-background text-foreground p-8 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-4">
          <header>
            <h1 className="text-xl font-semibold tracking-tight">
              Quelque chose s&apos;est casse cote renderer
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              L&apos;app a attrape l&apos;erreur. Copie le message ci-dessous
              si tu veux le partager pour debug.
            </p>
          </header>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="text-sm font-medium text-destructive mb-2">
              {err.name}: {err.message}
            </div>
            <pre className="text-[11px] font-mono whitespace-pre-wrap text-muted-foreground max-h-[300px] overflow-auto">
              {err.stack}
            </pre>
            {this.state.info && (
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer">
                  Component stack
                </summary>
                <pre className="text-[11px] font-mono whitespace-pre-wrap text-muted-foreground mt-2 max-h-[200px] overflow-auto">
                  {this.state.info}
                </pre>
              </details>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Reessayer
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="h-9 px-4 rounded-md border border-border text-sm"
            >
              Recharger l&apos;app
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tu peux aussi appuyer sur <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">F12</kbd> pour ouvrir DevTools.
          </p>
        </div>
      </div>
    )
  }
}
