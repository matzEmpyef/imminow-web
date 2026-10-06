import { Card } from './Card'
import { Button } from './Button'
import { ErrorReference } from './ErrorReference'

// The loading/error shape every full-page and full-section query guard used to hand-roll: an
// `animate-pulse` block while fetching, then a `<Card><p className="text-error">Could not load
// X.</p></Card>` on failure — 10+ files, each its own slightly different copy (some with a Retry
// button, some without; one, ClientProfilePage.tsx's CommissionsTab, silently `return null`ed on
// error with no message at all). One shared pair instead, so every consumer gets Retry for free
// and a genuine error can't go silent again.

// `className` carries both height and corner radius (`h-24 rounded-lg`, `h-16 rounded-md`, …) —
// required rather than defaulted, since every real usage varies on both and a partial default
// invites exactly the kind of silent mismatch this component exists to stop.
export function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-surface ${className}`} />
}

// `error` is the failure itself, when the caller has it: its request reference is shown under the
// message (review F-162), the one thing support needs to find the request in the server's log.
export function ErrorState({ message, onRetry, error }: { message: string; onRetry?: () => void; error?: unknown }) {
  return (
    <Card className="flex items-center justify-between gap-md">
      <div className="min-w-0">
        <p className="text-body-sm text-error">{message}</p>
        <ErrorReference error={error} className="mt-0.5" />
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Card>
  )
}
