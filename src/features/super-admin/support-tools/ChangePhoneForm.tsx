import { useState } from 'react'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/api/errors'
import { aboutHowLong, retryAfterSeconds } from '@/lib/retryAfter'
import { formatDate } from '@/lib/time'
import { isTextOk, readPhone } from '@/lib/validation'
import { useRecordUserPhone, type UserSearchResult } from '@/queries/supportTools'


/**
 * Records a new phone number for a student who cannot use their old one (owner ruling 1,
 * 2026-10-07). Students only — the parent shows this card for nobody else.
 *
 * A student changes their own number with two codes, the first to the number they already have.
 * One who has lost that number cannot, so they write to Support, and Support RECORDS the new
 * number here. Nothing on the account changes: the old number still signs them in, nobody is
 * signed out. The new number becomes theirs only when the student proves it with a code sent to
 * it, by signing in with it. The record lapses after a week if they never do.
 *
 * Like the other actions that touch how someone signs in, it takes a reason (kept in the audit
 * log) and the operator's own password, checked by the server. Every refusal is the server's own
 * sentence, beside the field it is about where that is known.
 */
export function ChangePhoneForm({
  result,
  onCancel,
  onRecorded,
}: {
  result: UserSearchResult
  onCancel: () => void
  /** The account as it now stands, with the number waiting on it. */
  onRecorded?: (updated: UserSearchResult) => void
}) {
  const record = useRecordUserPhone()
  const [newPhone, setNewPhone] = useState('')
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [done, setDone] = useState<UserSearchResult | null>(null)

  // Platform staff have no country of their own: the number is typed with its country code.
  const reading = readPhone(newPhone)
  const typed = reading.ok ? reading.e164 : ''
  const phoneError = newPhone.trim() && !reading.ok ? reading.message : undefined
  const canSubmit = reading.ok && isTextOk('reason', reason) && Boolean(password)

  const error = record.error
  const code = error instanceof ApiError ? error.code : undefined
  const passwordRefused = code === 'invalid_current_password' || code === 'step_up_required'
  const numberRefused = code === 'identifier_in_use'
  const waitSeconds = retryAfterSeconds(error)
  const retry = waitSeconds ? aboutHowLong(waitSeconds) : null

  if (done) {
    return (
      <div className="flex flex-col gap-sm">
        <p role="status" className="text-body-sm text-success">
          Recorded. Waiting for {result.name} to confirm {done.pending_phone ?? typed}
          {done.pending_phone_until ? `, until ${formatDate(done.pending_phone_until)}` : ''}.
        </p>
        <p className="text-body-sm text-text-primary">
          Ask {result.name} to sign in to the app with the new number. It becomes their number once they enter the
          code sent to it. Until then their current number still works and nothing else has changed.
        </p>
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
      <p className="text-caption text-text-secondary">
        For a student who can no longer use their old number. This records the new number; it becomes theirs when
        they sign in with it and enter the code sent to it. Their current number keeps working until then. Include
        the country code.
      </p>
      <TextField
        label="New phone number"
        type="tel"
        required
        placeholder="+919876543210"
        value={newPhone}
        onChange={(e) => setNewPhone(e.target.value)}
        error={phoneError ?? (numberRefused ? error?.message : undefined)}
      />
      <TextAreaField
        kind="reason"
        label="Reason"
        required
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        hint="How you checked it is really them. Kept in the audit log."
      />
      <TextField
        label="Your password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={passwordRefused ? error?.message : undefined}
      />

      {record.isError && !passwordRefused && !numberRefused && (
        <div role="alert" className="flex flex-col gap-0.5">
          <p className="text-body-sm text-error">{record.error.message}</p>
          {retry && <p className="text-caption text-text-secondary">You can try again in {retry}.</p>}
        </div>
      )}

      <div className="flex items-center justify-end gap-sm">
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={record.isPending}>
          Cancel
        </Button>
        <Button
          size="sm"
          loading={record.isPending}
          disabled={!canSubmit}
          onClick={() =>
            record.mutate(
              { id: result.id, new_phone: typed, reason: reason.trim(), password },
              {
                onSuccess: (updated) => {
                  setDone(updated ?? result)
                  if (updated) onRecorded?.(updated)
                },
              },
            )
          }
        >
          Record new number
        </Button>
      </div>
    </div>
  )
}
