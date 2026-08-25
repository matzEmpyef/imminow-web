import { Component, type ReactNode } from 'react'
import { Card } from './Card'
import { Button } from './Button'

// The one class component in the app — React's error-boundary API has no functional-component
// form, so this is unavoidable. Wraps the whole tree in main.tsx: before this existed, ANY
// uncaught render exception anywhere white-screened the entire console with no recovery path.
export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    // The one legitimate console use: last line of defense once a render has already failed —
    // the alternative is losing the stack trace entirely. (The disable directive must be the
    // line DIRECTLY above the call — it previously sat two comment-lines up and silently
    // suppressed nothing.)
    // eslint-disable-next-line no-console -- last-resort logging, see above
    console.error('Uncaught render error:', error)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-lg">
        <Card className="flex max-w-md flex-col items-center gap-md text-center">
          <h1 className="text-h2 text-text-primary">Something went wrong</h1>
          <p className="text-body-sm text-text-secondary">
            This page hit an unexpected error. Reloading usually fixes it — if it keeps happening, let your admin know
            what you were doing when it broke.
          </p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </Card>
      </div>
    )
  }
}
