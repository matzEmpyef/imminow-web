import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useResendGuardianLink, type UserSearchResult } from '@/queries/supportTools'

/**
 * Sends the guardian approval link again, for a student under 18 whose guardian declined twice or
 * used up their one retry on a mistyped address. Clears the decline count — that's the point of
 * the escalation. Only ever mounted when the caller has already checked `guardian_consent` makes
 * this relevant (not `not_required`, not absent).
 */
export function GuardianForm({ result, onCancel }: { result: UserSearchResult; onCancel: () => void }) {
  const resend = useResendGuardianLink()
  const [reason, setReason] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [email, setEmail] = useState('')
  const [succeeded, setSucceeded] = useState(false)

  const consent = result.guardian_consent

  if (succeeded) {
    return (
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm text-success">Guardian link sent again.</p>
        <div>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-sm">
      {consent && (
        <div className="flex flex-wrap items-center gap-sm rounded-md bg-background p-sm">
          <Badge color={consent.status === 'approved' ? 'success' : consent.status === 'declined' ? 'error' : 'warning'}>
            {consent.status.replace(/_/g, ' ')}
          </Badge>
          <span className="text-body-sm text-text-secondary">
            {consent.guardian_name
              ? `${consent.guardian_name}${consent.contact_masked ? ` · ${consent.contact_masked}` : ''}`
              : 'No guardian named yet.'}
            {` · ${consent.retries_remaining} retr${consent.retries_remaining === 1 ? 'y' : 'ies'} left`}
          </span>
        </div>
      )}
      <p className="text-caption text-text-secondary">
        Emails the guardian a fresh approval link and resets their decline count.
      </p>
      <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      <TextField label="Guardian name (optional)" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
      <TextField
        label="Guardian email (optional — leave blank to reuse the one on file)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {resend.isError && <p className="text-body-sm text-error">{resend.error.message}</p>}
      <div className="flex items-center justify-end gap-sm">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!reason.trim()}
          loading={resend.isPending}
          onClick={() =>
            resend.mutate(
              {
                id: result.id,
                reason: reason.trim(),
                guardian_name: guardianName.trim() || undefined,
                email: email.trim() || undefined,
              },
              { onSuccess: () => setSucceeded(true) },
            )
          }
        >
          Resend guardian link
        </Button>
      </div>
    </div>
  )
}
