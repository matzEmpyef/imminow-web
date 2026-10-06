import { Component, type ComponentType, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Card } from './Card'
import { Button } from './Button'

interface BoundaryProps {
  children: ReactNode
  /** What to show instead of the crashed tree. `reset` tries the children again. */
  fallback: (reset: () => void) => ReactNode
  /** When this changes the boundary lets its children try again (a move to another page). */
  resetKey?: string
}

// The one class component in the app — React's error-boundary API has no functional-component
// form, so this is unavoidable. Both boundaries below are this class with a different fallback.
class Boundary extends Component<BoundaryProps, { hasError: boolean; resetKey?: string }> {
  state = { hasError: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  // A different `resetKey` (the person moved to another page) clears the crash, in the same
  // render the new page arrives in.
  static getDerivedStateFromProps(props: BoundaryProps, state: { hasError: boolean; resetKey?: string }) {
    return props.resetKey === state.resetKey ? null : { hasError: false, resetKey: props.resetKey }
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
    return this.props.fallback(() => this.setState({ hasError: false }))
  }
}

/**
 * Wraps the whole tree in main.tsx: before this existed, ANY uncaught render exception anywhere
 * white-screened the entire console with no recovery path. It is now the LAST resort — a crash
 * inside a page is caught closer in, by `PageErrorBoundary`, which keeps the menu.
 */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Boundary
      fallback={() => (
        <div className="flex min-h-screen items-center justify-center bg-background p-lg">
          {/* Inline maxWidth, not `max-w-md` — that class resolves from this project's custom
              spacing scale and computes to 16px, which collapsed this card into a ~48px vertical
              sliver with the Reload button overflowing it. See the NOTE in styles/tailwind.config.ts
              and the same fix in GlobalSearch.tsx. */}
          <Card className="flex w-full flex-col items-center gap-md text-center" style={{ maxWidth: '28rem' }}>
            <h1 className="text-h2 text-text-primary">Something went wrong</h1>
            <p className="text-body-sm text-text-secondary">
              This page hit an unexpected error. Reloading usually fixes it — if it keeps happening, let your admin know
              what you were doing when it broke.
            </p>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </Card>
        </div>
      )}
    >
      {children}
    </Boundary>
  )
}

/**
 * Around the pages of one part of the console (review F-162), inside its route guard. When a page
 * crashes, the person keeps the menu, the header and their session: the page area alone shows
 * what happened, with a way to try the page again, and choosing any other page from the menu
 * clears it. A crash used to replace the whole console with one card whose only way out was a
 * full reload.
 *
 * `shell` is the chrome that part of the console uses. The pages draw their own shell, so the
 * boundary has to draw it for them when they cannot. (If the shell itself is what crashed, the
 * failure passes up to `AppErrorBoundary`.)
 */
export function PageErrorBoundary({
  shell: Shell,
  children,
}: {
  shell: ComponentType<{ children: ReactNode }>
  children: ReactNode
}) {
  const { pathname } = useLocation()
  return (
    <Boundary
      resetKey={pathname}
      fallback={(reset) => (
        <Shell>
          <div className="flex justify-center pt-xl">
            <Card className="flex w-full flex-col items-center gap-md text-center" style={{ maxWidth: '30rem' }}>
              <h1 className="text-h2 text-text-primary">This page hit a problem</h1>
              <p role="alert" className="text-body-sm text-text-secondary">
                The rest of the console is still working. Try this page again, or choose another page from the menu.
                If it keeps happening, let your admin know what you were doing.
              </p>
              <div className="flex flex-wrap justify-center gap-sm">
                <Button onClick={reset}>Try again</Button>
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Reload the console
                </Button>
              </div>
            </Card>
          </div>
        </Shell>
      )}
    >
      {children}
    </Boundary>
  )
}
