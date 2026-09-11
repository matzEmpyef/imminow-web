import { Button } from '@/components/Button'
import { relativeTime } from '@/lib/time'

/**
 * Who owns this complaint or dispute, and the pick-up/take-over controls (2026-09-11). Shared
 * between both drawers — a complaint's "in_review" pick-up and "assign_to_me" take-over are two
 * different PATCH bodies, a dispute's pick-up and take-over are the same POST either way, but the
 * two callers look identical from here, which is the point of pulling this out.
 *
 * There is no reliable way for this component to know whether the signed-in admin IS the current
 * owner, so "Take over" always shows once someone owns it — harmless even when that someone is you.
 */
export function OwnerSection({
  assignedToName,
  pickedUpAt,
  onPickUp,
  onTakeOver,
  pending,
  readOnly,
}: {
  assignedToName?: string | null
  pickedUpAt?: string | null
  onPickUp: () => void
  onTakeOver: () => void
  pending?: boolean
  readOnly?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-md rounded-md bg-background px-md py-sm">
      <div>
        <p className="text-caption text-text-secondary">Owner</p>
        {assignedToName ? (
          <p className="text-body-sm text-text-primary">
            {assignedToName}
            {pickedUpAt && <span className="text-text-secondary"> · picked up {relativeTime(pickedUpAt)}</span>}
          </p>
        ) : (
          <p className="text-body-sm text-warning">Unassigned</p>
        )}
      </div>
      {!readOnly &&
        (assignedToName ? (
          <Button size="sm" variant="secondary" loading={pending} onClick={onTakeOver} className="whitespace-nowrap">
            Take over
          </Button>
        ) : (
          <Button size="sm" loading={pending} onClick={onPickUp} className="whitespace-nowrap">
            Pick up
          </Button>
        ))}
    </div>
  )
}
