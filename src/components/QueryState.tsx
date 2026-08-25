import { Card } from './Card'
import { Button } from './Button'

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

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="flex items-center justify-between gap-md">
      <p className="text-body-sm text-error">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Card>
  )
}
