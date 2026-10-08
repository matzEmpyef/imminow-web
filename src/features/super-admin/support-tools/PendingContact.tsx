import { formatDate } from '@/lib/time'
import type { UserSearchResult } from '@/queries/supportTools'

type PendingFields = Pick<
  UserSearchResult,
  'pending_email' | 'pending_email_until' | 'pending_phone' | 'pending_phone_until'
>

function until(value: string | null | undefined): string {
  return value ? ` (until ${formatDate(value)})` : ''
}

/**
 * A new email or phone number Support recorded that the person has not confirmed yet (owner
 * rulings 1 and 4, 2026-10-07). It is NOT the account's contact: the one shown above it still
 * signs the person in. Shown wherever a Support Tools user is shown (the search row and the
 * actions popup), so an operator who opens the account again sees that something is waiting, and
 * until when, instead of recording it a second time. Renders nothing when nothing is waiting.
 */
export function PendingContact({ user, className = '' }: { user: PendingFields; className?: string }) {
  if (!user.pending_email && !user.pending_phone) return null
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {user.pending_email && (
        <p className="text-caption font-medium text-warning">
          Waiting for confirmation: {user.pending_email}
          {until(user.pending_email_until)}
        </p>
      )}
      {user.pending_phone && (
        <p className="text-caption font-medium text-warning">
          Waiting for confirmation: {user.pending_phone}
          {until(user.pending_phone_until)}
        </p>
      )}
    </div>
  )
}
