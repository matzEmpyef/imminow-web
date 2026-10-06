import { useState } from 'react'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/api/errors'
import { humaniseCode } from '@/lib/humanise'
import { aboutHowLong, retryAfterSeconds } from '@/lib/retryAfter'
import { formatDate } from '@/lib/time'
import { ERASE_REASON_NOTE, IMMEDIATE_LEGAL_BASIS_NOTE } from './erasureReasonNotes'
import { useEraseUserData, type ErasureQueued, type UserSearchResult } from '@/queries/supportTools'

/** A legal request must say what it is: the server refuses a shorter reason. */
const IMMEDIATE_REASON_MIN = 20
/** The window the server gives a scheduled erasure. Only used to word the date before sending. */
const WINDOW_DAYS = 30

function sameIdentifier(typed: string, expected: string): boolean {
  return typed.trim().toLowerCase() === expected.trim().toLowerCase()
}

/**
 * Erase a user's data (gate 12f, owner decision 20). Super Admin only — the parent hides this card
 * for anyone else.
 *
 * What it really does, which the screen must say in so many words: the account is LOCKED now and
 * its open cases and chats close; the personal data is erased 30 days later, and until then the
 * account can be kept. "Erase immediately" (a legal request) skips the window and cannot be
 * cancelled.
 *
 * Three guards before anything is sent, because this ends someone's account:
 *   1. the account is restated in full and its email (or phone, for a phone-only account) must be
 *      typed, so the operator confirms against the person and not against a row they clicked;
 *   2. the operator's own password, checked by the server;
 *   3. a second screen that states exactly what will happen, with the date.
 */
export function EraseForm({ result, onCancel }: { result: UserSearchResult; onCancel: () => void }) {
  const eraseData = useEraseUserData()
  const [reason, setReason] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [immediate, setImmediate] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<ErasureQueued | null>(null)

  // What the operator types to confirm: the email, or the phone for a phone-only account.
  const identifier = result.email ?? result.phone ?? ''
  const identifierKind = result.email ? 'email' : 'phone number'
  const identifierMatches = Boolean(identifier) && sameIdentifier(confirmText, identifier)
  const reasonTooShort = immediate && reason.trim().length < IMMEDIATE_REASON_MIN
  const canContinue = Boolean(reason.trim()) && !reasonTooShort && identifierMatches && Boolean(password)

  const estimatedDate = formatDate(new Date(Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000))
  const error = eraseData.error
  const passwordRefused = error instanceof ApiError && error.code === 'invalid_current_password'
  // 429: the operator's daily allowance, or too many wrong passwords. The server's sentence says
  // which and what to do; the wait comes with it. The form stays as it was filled in.
  const rateLimited = error instanceof ApiError && error.code === 'rate_limited'
  const waitSeconds = rateLimited ? retryAfterSeconds(error) : null
  // 503: the allowance could not be read, so nothing was done. Asking again can work.
  const unavailable = error instanceof ApiError && (error.status === 503 || error.code === 'service_unavailable')

  function submit() {
    eraseData.mutate(
      { id: result.id, reason: reason.trim(), password, immediate },
      {
        onSuccess: (answer) => setDone(answer ?? { status: immediate ? 'erasure_queued' : 'erasure_pending' }),
        // Back to the form: the message belongs beside the field that needs changing.
        onError: () => setConfirming(false),
      },
    )
  }

  if (done) {
    return (
      <div className="flex flex-col gap-sm">
        <p role="status" className="text-body-sm text-success">
          {done.status === 'erasure_queued'
            ? `Erasure started for ${result.name}.`
            : `Erasure scheduled for ${result.name} — their data is erased on ${
                done.due_at ? formatDate(done.due_at) : estimatedDate
              } unless it is cancelled before then.`}
        </p>
        <p className="text-caption text-text-secondary">
          {done.status === 'erasure_queued'
            ? 'The account is locked and the data is erased within minutes. This cannot be cancelled.'
            : 'The account is locked now. You can keep it from Pending erasures on the Support Tools page.'}
        </p>
        <div>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  const account = (
    <dl
      style={{ gridTemplateColumns: 'auto 1fr' }}
      className="grid gap-x-md gap-y-0.5 rounded-md border border-error/40 bg-error/5 p-sm text-body-sm"
    >
      <dt className="text-text-secondary">Name</dt>
      <dd className="font-semibold text-error">{result.name}</dd>
      <dt className="text-text-secondary">Email</dt>
      <dd className="break-all text-text-primary">{result.email ?? 'None (phone-only account)'}</dd>
      <dt className="text-text-secondary">Phone</dt>
      <dd className="text-text-primary">{result.phone ?? 'None'}</dd>
      <dt className="text-text-secondary">Role</dt>
      <dd className="text-text-primary">{humaniseCode(result.role)}</dd>
      <dt className="text-text-secondary">Consultancy</dt>
      <dd className="text-text-primary">{result.consultancy_name ?? 'None'}</dd>
      <dt className="text-text-secondary">Account ID</dt>
      <dd className="break-all font-mono text-caption text-text-primary">{result.id}</dd>
    </dl>
  )

  if (confirming) {
    return (
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm font-semibold text-error">
          {immediate ? `Erase ${result.name}’s data now?` : `Schedule erasure for ${result.name}?`}
        </p>
        {account}
        <ul className="list-disc space-y-xs pl-lg text-body-sm text-text-primary">
          <li>The account is locked now. They are signed out and cannot sign in.</li>
          <li>
            Their open cases and chats close with the reason &ldquo;account deleted&rdquo;, and each consultancy is
            told. These stay closed even if the account is kept.
          </li>
          {immediate ? (
            <li className="font-semibold text-error">
              Their personal data is erased within minutes. Nothing can be cancelled.
            </li>
          ) : (
            <li>
              Their personal data is permanently erased on <strong>{estimatedDate}</strong>, 30 days from now. Until
              then you can keep the account from Pending erasures, and a student can keep it by signing in.
            </li>
          )}
          <li>Payments and invoices already recorded stay, with the name removed.</li>
        </ul>
        <div className="flex items-center justify-end gap-sm">
          <Button size="sm" variant="secondary" disabled={eraseData.isPending} onClick={() => setConfirming(false)}>
            Go back
          </Button>
          <Button size="sm" variant="destructive" loading={eraseData.isPending} onClick={submit}>
            {immediate ? 'Erase now' : 'Schedule erasure'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-sm">
      {account}
      <p className="text-caption text-text-secondary">
        Locks the account now, closes their open cases and chats with the reason &ldquo;account deleted&rdquo; and
        tells each consultancy, and permanently erases their personal data on {estimatedDate}, 30 days from now. Until
        then it can be cancelled from the Pending erasures list or by the person signing in.
      </p>

      <TextAreaField
        label="Reason"
        required
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={
          immediate && reason.trim() && reasonTooShort
            ? `A legal request needs a reason of at least ${IMMEDIATE_REASON_MIN} characters.`
            : undefined
        }
      />
      {/* Always visible, not a hint: a hint gives way to an error message, and this must not. */}
      <p className="-mt-xs text-caption text-text-secondary">
        {ERASE_REASON_NOTE}
        {immediate && ` ${IMMEDIATE_LEGAL_BASIS_NOTE}`}
      </p>
      <TextField
        label={`Type the account’s ${identifierKind} to confirm`}
        required
        autoComplete="off"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        error={confirmText && !identifierMatches ? `This does not match the account’s ${identifierKind}.` : undefined}
      />
      <TextField
        label="Your password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={passwordRefused ? error.message : undefined}
      />

      <label className="flex cursor-pointer items-start gap-sm text-body-sm text-text-primary">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={immediate}
          onChange={(e) => setImmediate(e.target.checked)}
        />
        <span>Erase immediately (legal request)</span>
      </label>
      {immediate && (
        <p className="text-body-sm font-semibold text-error">
          Nothing can be cancelled. The data is erased within minutes.
        </p>
      )}

      {/* The server's own sentence: an active role (lockout_guard), an erasure already pending
          (conflict, with its date), a missing step-up. A wrong password is shown on its field. */}
      {eraseData.isError && !passwordRefused && (
        <div className="flex flex-col gap-xs">
          <p role="alert" className="text-body-sm text-error">
            {unavailable
              ? 'Support Tools could not check your daily allowance just now, so nothing was done. Try again in a moment.'
              : eraseData.error.message}
          </p>
          {waitSeconds && (
            <p className="text-caption text-text-secondary">You can try again in {aboutHowLong(waitSeconds)}.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-sm">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="destructive" disabled={!canContinue} onClick={() => setConfirming(true)}>
          Continue
        </Button>
      </div>
    </div>
  )
}
