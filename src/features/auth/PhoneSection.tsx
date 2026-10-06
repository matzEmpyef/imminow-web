import { useState, type FormEvent } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { OneTimeCodeDialog } from '@/components/OneTimeCodeDialog'
import { TextField } from '@/components/TextField'
import { retryAfterSeconds, countdownText } from '@/lib/retryAfter'
import { showToast } from '@/lib/toast'
import { useCountdown } from '@/lib/useCountdown'
import { E164_PHONE_ERROR, isValidE164Phone } from '@/lib/validation'
import { useRequestPhoneCode, useUpdateProfile, useVerifyPhoneCode } from '@/queries/profile'

/** Spaces, hyphens, dots and brackets people type between digits; the server wants plain E.164. */
function plainNumber(raw: string): string {
  return raw.replace(/[\s\-().]/g, '')
}

export const UNVERIFIED_NOTE =
  'An unverified number may be removed from this account if its owner verifies it elsewhere. Verify it to keep it.'

/**
 * The phone number on My Account, for staff, freelancers and platform staff. A new or changed
 * number is saved only after its owner enters the code texted to it (`POST /auth/otp/request`,
 * then `POST /auth/otp/verify`): the profile form no longer takes one. A number typed here before
 * that rule stays, shown as "Not verified", with a Verify action that runs the same steps. Removing
 * a number is still a plain save (`PATCH /profile {phone: null}`).
 */
export function PhoneSection({
  phone,
  verified,
  shownToStudents,
}: {
  phone: string | null
  verified: boolean
  /** A consultancy's staff are reachable by their students; everyone else only by immiNow. */
  shownToStudents: boolean
}) {
  const requestCode = useRequestPhoneCode()
  const verifyCode = useVerifyPhoneCode()
  const removePhone = useUpdateProfile()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  // The number a code was sent to, and the first resend wait, while the code dialog is open.
  const [pending, setPending] = useState<{ phone: string; resendAfter?: number } | null>(null)
  const wait = useCountdown()

  const typed = plainNumber(draft)
  const draftError = draft.trim() && !isValidE164Phone(typed) ? E164_PHONE_ERROR : undefined
  const canSend = isValidE164Phone(typed) && !asking && wait.secondsLeft === 0

  async function ask(number: string): Promise<boolean> {
    setAsking(true)
    setRequestError(null)
    try {
      const answer = await requestCode.mutateAsync(number)
      setPending({ phone: number, resendAfter: answer?.resend_after_seconds })
      return true
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Could not send a code. Try again.')
      const seconds = retryAfterSeconds(error)
      if (seconds) wait.start(seconds)
      return false
    } finally {
      setAsking(false)
    }
  }

  function startAdd() {
    setDraft('')
    setRequestError(null)
    setEditing(true)
  }

  async function startVerify() {
    if (!phone) return
    const number = plainNumber(phone)
    if (isValidE164Phone(number)) {
      await ask(number)
      return
    }
    // A legacy number typed without its country code cannot be texted as it is.
    setDraft(phone)
    setRequestError(null)
    setEditing(true)
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!canSend) return
    await ask(typed)
  }

  function closeEditor() {
    setEditing(false)
    setDraft('')
    setRequestError(null)
  }

  function remove() {
    removePhone.mutate(
      { phone: null },
      {
        onSuccess: () => {
          setConfirmingRemove(false)
          showToast('Phone number removed')
        },
      },
    )
  }

  return (
    <div className="mt-md flex flex-col gap-sm border-t border-border pt-md">
      <div>
        <p className="text-body font-medium text-text-primary">Phone number</p>
        <p className="text-caption text-text-secondary">
          {shownToStudents
            ? 'Shown to students you work with, so they can reach you.'
            : 'Used by immiNow to reach you. Never shown to students.'}
        </p>
      </div>

      {!editing && phone && (
        <>
          <div className="flex flex-wrap items-center gap-sm">
            <span className="text-body text-text-primary">{phone}</span>
            <Badge color={verified ? 'success' : 'warning'}>{verified ? 'Verified' : 'Not verified'}</Badge>
            <div className="ml-auto flex flex-wrap items-center gap-sm">
              {!verified && (
                <Button size="sm" loading={asking} disabled={wait.secondsLeft > 0} onClick={startVerify}>
                  Verify
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={startAdd}>
                Change
              </Button>
              {confirmingRemove ? (
                <>
                  <Button size="sm" variant="destructive" loading={removePhone.isPending} onClick={remove}>
                    Remove number
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmingRemove(false)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setConfirmingRemove(true)}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          {!verified && <p className="text-caption text-text-secondary">{UNVERIFIED_NOTE}</p>}
        </>
      )}

      {!editing && !phone && (
        <div className="flex flex-wrap items-center gap-sm">
          <p className="text-body-sm text-text-secondary">No phone number on your account yet.</p>
          <Button size="sm" className="ml-auto" onClick={startAdd}>
            Add phone number
          </Button>
        </div>
      )}

      {editing && (
        <form onSubmit={handleSend} className="flex flex-col gap-sm" noValidate>
          <TextField
            label="New phone number"
            type="tel"
            required
            placeholder="+919876543210"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setRequestError(null)
            }}
            error={draftError}
          />
          {!draftError && (
            <p className="text-caption text-text-secondary">
              Include the country code. We text a code to this number, and it is saved once you enter it.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-sm">
            {requestError && (
              <p role="alert" className="mr-auto text-body-sm text-error">
                {requestError}
              </p>
            )}
            {wait.secondsLeft > 0 && (
              <p role="status" className="text-caption text-text-secondary">
                You can ask again in {countdownText(wait.secondsLeft)}.
              </p>
            )}
            <Button variant="secondary" onClick={closeEditor}>
              Cancel
            </Button>
            <Button type="submit" loading={asking} disabled={!canSend}>
              Send code
            </Button>
          </div>
        </form>
      )}

      {!editing && requestError && (
        <div className="flex flex-col gap-xs">
          <p role="alert" className="text-body-sm text-error">
            {requestError}
          </p>
          {wait.secondsLeft > 0 && (
            <p role="status" className="text-caption text-text-secondary">
              You can ask again in {countdownText(wait.secondsLeft)}.
            </p>
          )}
        </div>
      )}
      {removePhone.isError && <p className="text-body-sm text-error">{removePhone.error.message}</p>}

      {pending && (
        <OneTimeCodeDialog
          title="Verify your phone number"
          sentTo={pending.phone}
          initialResendSeconds={pending.resendAfter}
          onVerify={async (code) => {
            await verifyCode.mutateAsync({ phone: pending.phone, code })
            showToast('Phone number verified')
            setPending(null)
            closeEditor()
          }}
          onResend={async () => {
            const answer = await requestCode.mutateAsync(pending.phone)
            return answer?.resend_after_seconds
          }}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  )
}
