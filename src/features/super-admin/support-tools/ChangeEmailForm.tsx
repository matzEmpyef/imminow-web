import { useState } from 'react'
import { Button } from '@/components/Button'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { useUpdateUserEmail, type UserSearchResult } from '@/queries/supportTools'
import { EMAIL_ERROR, isValidEmail } from '@/lib/validation'

const VERIFICATION_OPTIONS = [
  { value: 'called_registered_phone', label: 'Called their registered phone' },
  { value: 'video_call', label: 'Video call' },
  { value: 'id_document', label: 'Checked an ID document' },
  { value: 'other', label: 'Other' },
] as const

type VerificationMethod = (typeof VERIFICATION_OPTIONS)[number]['value']

/**
 * Changes a locked-out user's sign-in email (rewritten 2026-09-12). Two steps: fill in the new
 * address and how identity was verified, then a confirm screen that spells out the consequence —
 * this signs them out everywhere — before it actually happens.
 */
export function ChangeEmailForm({ result, onCancel }: { result: UserSearchResult; onCancel: () => void }) {
  const updateEmail = useUpdateUserEmail()
  const [newEmail, setNewEmail] = useState('')
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod | ''>('')
  const [verificationNote, setVerificationNote] = useState('')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [succeeded, setSucceeded] = useState(false)

  const emailError = newEmail && !isValidEmail(newEmail) ? EMAIL_ERROR : undefined
  const noteRequired = verificationMethod === 'other'
  const canContinue = Boolean(
    newEmail && !emailError && verificationMethod && (!noteRequired || verificationNote.trim()) && reason.trim(),
  )

  if (succeeded) {
    return (
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm text-success">
          Email updated. {result.email} and {newEmail} were both notified, and they've been signed out everywhere.
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
        <p className="rounded-md bg-background p-sm text-body-sm text-text-primary">
          Their old address ({result.email}) and the new one ({newEmail}) are both emailed, and they are signed out on
          every device.
        </p>
        {updateEmail.isError && <p className="text-body-sm text-error">{updateEmail.error.message}</p>}
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
                { onSuccess: () => setSucceeded(true) },
              )
            }
          >
            Confirm change
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
