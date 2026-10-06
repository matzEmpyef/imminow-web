import { useState } from 'react'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/api/errors'
import { aboutHowLong, retryAfterSeconds } from '@/lib/retryAfter'
import { formatDate, localDateISO } from '@/lib/time'
import { useCorrectDateOfBirth, type DateOfBirthCorrection, type UserSearchResult } from '@/queries/supportTools'

/** What the correction did to the guardian requirement, in words. `none` says nothing. */
const GUARDIAN_EFFECT_LINE: Record<DateOfBirthCorrection['guardian_effect'], string | null> = {
  now_required: "This student is now under 18 and needs a guardian's approval.",
  no_longer_required: "This student no longer needs a guardian's approval.",
  none: null,
}

/**
 * Correct a student's date of birth (owner decision 3, lane x). Students only — the parent shows
 * this card for nobody else.
 *
 * A student cannot change a recorded date of birth in the app, so this is the one place it
 * changes: Support checks a document and types the date. It matters more than it looks, because
 * the guardian requirement follows the date at once: a date that makes the student under 18 puts
 * their account on hold for a guardian from that moment. So, like Erase:
 *   1. a reason that names the document checked, kept in the audit log;
 *   2. the operator's own password, checked by the server;
 *   3. a second screen that states exactly what will happen before anything is sent.
 *
 * Every rule is the server's (a real date, not in the future, not the date already recorded, not
 * under 16): its own sentence is shown, beside the field it is about where that is known.
 */
export function DateOfBirthForm({ result, onCancel }: { result: UserSearchResult; onCancel: () => void }) {
  const correct = useCorrectDateOfBirth()
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<DateOfBirthCorrection | null>(null)

  const canContinue = Boolean(dateOfBirth) && Boolean(reason.trim()) && Boolean(password)
  const error = correct.error
  const code = error instanceof ApiError ? error.code : undefined
  const passwordRefused = code === 'invalid_current_password' || code === 'step_up_required'
  const dateRefused = code === 'below_minimum_age'
  const waitSeconds = retryAfterSeconds(error)
  const retry = waitSeconds ? aboutHowLong(waitSeconds) : null

  function submit() {
    correct.mutate(
      { id: result.id, date_of_birth: dateOfBirth, reason: reason.trim(), password },
      {
        onSuccess: (answer) => setDone(answer),
        // Back to the form: the message belongs beside the field that needs changing.
        onError: () => setConfirming(false),
      },
    )
  }

  if (done) {
    const effect = GUARDIAN_EFFECT_LINE[done.guardian_effect]
    return (
      <div className="flex flex-col gap-sm">
        <p role="status" className="text-body-sm text-success">
          Date of birth corrected for {result.name}. It is now {formatDate(done.date_of_birth)}
          {done.previous_date_of_birth ? ` (it was ${formatDate(done.previous_date_of_birth)})` : ''}.
        </p>
        {effect && <p className="text-body-sm font-medium text-text-primary">{effect}</p>}
        <p className="text-caption text-text-secondary">
          The student has been told that their date of birth was corrected. The message does not show the date.
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
        <p className="text-body-sm font-semibold text-text-primary">
          Change {result.name}&rsquo;s date of birth to {formatDate(dateOfBirth)}?
        </p>
        <ul className="list-disc space-y-xs pl-lg text-body-sm text-text-primary">
          <li>The date of birth on their account is replaced with this one.</li>
          <li>
            If this date makes them under 18, their account waits for a parent or guardian&rsquo;s approval from this
            moment. If it makes them 18 or over, they no longer need one.
          </li>
          <li>
            The student is told by notification and email that their date of birth was corrected. The message does not
            show the date.
          </li>
          <li>Your reason and both dates are kept in the audit log.</li>
        </ul>
        <div className="flex items-center justify-end gap-sm">
          <Button size="sm" variant="secondary" disabled={correct.isPending} onClick={() => setConfirming(false)}>
            Go back
          </Button>
          <Button size="sm" loading={correct.isPending} onClick={submit}>
            Correct date of birth
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-sm">
      <p className="text-caption text-text-secondary">
        A student cannot change their date of birth themselves. Check it against a document they show you, then enter
        the correct date here. Whether they need a guardian&rsquo;s approval follows the new date straight away.
      </p>

      <TextField
        label="Correct date of birth"
        type="date"
        required
        max={localDateISO()}
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        error={dateRefused ? error?.message : undefined}
      />
      <TextAreaField
        label="Which document did you check?"
        required
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        hint="For example: passport, birth certificate. Kept in the audit log."
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

      {/* The server's own sentence: not a real date, a date in the future, the date already on the
          account, too many corrections this hour. A refused password or an under-16 date is shown
          on its own field above. */}
      {correct.isError && !passwordRefused && !dateRefused && (
        <div role="alert" className="flex flex-col gap-0.5">
          <p className="text-body-sm text-error">{correct.error.message}</p>
          {retry && <p className="text-caption text-text-secondary">You can try again in {retry}.</p>}
        </div>
      )}

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
