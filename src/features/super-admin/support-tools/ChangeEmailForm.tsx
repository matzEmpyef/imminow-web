import { useState } from 'react'
import { Button } from '@/components/Button'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { aboutHowLong, retryAfterSeconds } from '@/lib/retryAfter'
import { formatDate } from '@/lib/time'
import { useUpdateUserEmail, type UserSearchResult } from '@/queries/supportTools'
import { EMAIL_ERROR, isValidEmail } from '@/lib/validation'

const VERIFICATION_OPTIONS = [
  { value: 'called_registered_phone', label: 'Called their registered phone' },
  { value: 'video_call', label: 'Video call' },
  { value: 'id_document', label: 'Checked an ID document' },
  { value: 'other', label: 'Other' },
] as const

type VerificationMethod = (typeof VERIFICATION_OPTIONS)[number]['value']

/** How this person confirms a recorded address, which differs by where they sign in. */
function howToConfirm(result: UserSearchResult): string {
  return result.role === 'student'
    ? 'They confirm it by signing in to the app with the new address and entering the code sent to it.'
    : 'They confirm it by choosing Forgot password on the sign-in page with the new address; the link is sent there.'
}

/**
 * Records a new sign-in email for a locked-out user (owner ruling 4, 2026-10-07; first written
 * 2026-09-12 as a form that changed the email itself).
 *
 * Support no longer changes the email. This RECORDS the new address as waiting: the account's
 * current email and phone keep signing the person in, and nobody is signed out. It becomes the
 * sign-in email only when the person proves it, and lapses after a week if they never do. So the
 * form never says the email was changed or that anyone was signed out. Two steps as before: the
 * new address and how identity was verified, then a screen that says what will happen.
 *
 * Refusals are the server's own sentence: the address belongs to (or is waiting on) another
 * account, the account is scheduled for deletion, or this operator has reached the hour's limit.
 */
export function ChangeEmailForm({
  result,
  onCancel,
  onRecorded,
}: {
  result: UserSearchResult
  onCancel: () => void
  /** The account as it now stands, with the address waiting on it. */
  onRecorded?: (updated: UserSearchResult) => void
}) {
  const updateEmail = useUpdateUserEmail()
  const [newEmail, setNewEmail] = useState('')
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod | ''>('')
  const [verificationNote, setVerificationNote] = useState('')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<UserSearchResult | null>(null)

  const emailError = newEmail && !isValidEmail(newEmail) ? EMAIL_ERROR : undefined
  const noteRequired = verificationMethod === 'other'
  const canContinue = Boolean(
    newEmail && !emailError && verificationMethod && (!noteRequired || verificationNote.trim()) && reason.trim(),
  )
  const waitSeconds = retryAfterSeconds(updateEmail.error)
  const retry = waitSeconds ? aboutHowLong(waitSeconds) : null

  if (done) {
    return (
      <div className="flex flex-col gap-sm">
        <p role="status" className="text-body-sm text-success">
          Recorded. Waiting for {result.name} to confirm {done.pending_email ?? newEmail}
          {done.pending_email_until ? `, until ${formatDate(done.pending_email_until)}` : ''}.
        </p>
        <p className="text-body-sm text-text-primary">
          {howToConfirm(result)} Until then their current sign-in still works and nothing else has changed.
        </p>
        <div>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm font-semibold text-text-primary">{result.name}</p>
        <div className="flex flex-col gap-xs rounded-md bg-background p-sm text-body-sm text-text-primary">
          <p>
            {newEmail} is recorded as waiting for {result.name} to confirm. {howToConfirm(result)}
          </p>
          <p>
            We email the new address how to confirm it and by when
            {result.email ? `, and let ${result.email} know that a new address is waiting` : ''}. Their current
            sign-in keeps working and they stay signed in.
          </p>
        </div>
        {updateEmail.isError && (
          <div role="alert" className="flex flex-col gap-0.5">
            <p className="text-body-sm text-error">{updateEmail.error.message}</p>
            {retry && <p className="text-caption text-text-secondary">You can try again in {retry}.</p>}
          </div>
        )}
        <div className="flex items-center justify-end gap-sm">
          <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={updateEmail.isPending}>
            Back
          </Button>
          <Button
            size="sm"
            loading={updateEmail.isPending}
            onClick={() =>
              updateEmail.mutate(
                {
                  id: result.id,
                  new_email: newEmail,
                  reason: reason.trim(),
                  verification_method: verificationMethod as VerificationMethod,
                  verification_note: noteRequired ? verificationNote.trim() : undefined,
                },
                {
                  onSuccess: (updated) => {
                    setDone(updated ?? result)
                    if (updated) onRecorded?.(updated)
                  },
                },
              )
            }
          >
            Record new email
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-sm">
      <TextField
        label="New email"
        type="email"
        required
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        error={emailError}
      />
      <SelectField
        label="How did you verify it's really them?"
        required
        value={verificationMethod}
        onChange={(e) => setVerificationMethod(e.target.value as VerificationMethod)}
      >
        <option value="">Select…</option>
        {VERIFICATION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      {noteRequired && (
        <TextField
          label="Note"
          required
          value={verificationNote}
          onChange={(e) => setVerificationNote(e.target.value)}
        />
      )}
      <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex items-center justify-end gap-sm">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!canContinue} onClick={() => setConfirming(true)}>
          Continue
        </Button>
      </div>
    </div>
  )
}
