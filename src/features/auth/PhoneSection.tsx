import { useState, type FormEvent } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { OneTimeCodeDialog } from '@/components/OneTimeCodeDialog'
import { TextField } from '@/components/TextField'
import { retryAfterSeconds, countdownText } from '@/lib/retryAfter'
import { showToast } from '@/lib/toast'
import { useCountdown } from '@/lib/useCountdown'
import { readPhone } from '@/lib/validation'
import {
  stepUpChannelsFrom,
  usePhoneStepUp,
  useRequestPhoneCode,
  useRequestStepUpCode,
  useUpdateProfile,
  useVerifyPhoneCode,
  useVerifyStepUpCode,
  type StepUpChannel,
} from '@/queries/profile'

export const UNVERIFIED_NOTE =
  'An unverified number may be removed from this account if its owner verifies it elsewhere. Verify it to keep it.'

/** What the person set out to do with a number they have already verified. */
type Intent = 'change' | 'remove'

/** Said before anything is sent, so nobody is surprised by a second code. */
export const TWO_CODES_NOTE =
  'First we send a code to a contact you have already proved, so we know it is you. Then we send a code to the new number.'
export const REMOVE_CODE_NOTE =
  'We send a code to a contact you have already proved, so we know it is you. Your number is removed once you enter it.'

function channelLabel(channel: StepUpChannel): string {
  return channel.channel === 'email'
    ? `Your email (${channel.destination_mask})`
    : `Your current number (${channel.destination_mask})`
}

/**
 * The phone number on My Account, for staff, freelancers and platform staff. A new or changed
 * number is saved only after its owner enters the code texted to it (`POST /auth/otp/request`,
 * then `POST /auth/otp/verify`): the profile form no longer takes one. A number typed here before
 * that rule stays, shown as "Not verified", with a Verify action that runs the same steps.
 *
 * A VERIFIED number is changed or removed with a FIRST code (owner ruling 1, 2026-10-07): the
 * person proves a contact they already hold (the current number, or their verified email), and
 * only then is the new number's code sent, or the number removed. So that nobody is surprised by
 * a second code, the section says so before anything is sent: Change or Remove first asks the
 * server whether a first code is needed (`GET /auth/otp/step-up`) and shows the two steps, with
 * where the first code can go. Adding a first number, or verifying the one already here, takes
 * only that number's own code, as before.
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
  const checkStepUp = usePhoneStepUp()
  const requestFirstCode = useRequestStepUpCode()
  const verifyFirstCode = useVerifyStepUpCode()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  // The number a code was sent to, and the first resend wait, while the code dialog is open.
  const [pending, setPending] = useState<{ phone: string; resendAfter?: number } | null>(null)
  // The first-code step: what it is for, where the code can go, and the contact chosen.
  const [firstStep, setFirstStep] = useState<{
    intent: Intent
    channels: StepUpChannel[]
    channel: StepUpChannel['channel']
  } | null>(null)
  // Which of Change / Remove is asking the server whether a first code is needed.
  const [checking, setChecking] = useState<Intent | null>(null)
  // The first code is on its way: where it went (masked) and the first resend wait.
  const [firstCode, setFirstCode] = useState<{ sentTo: string; resendAfter?: number } | null>(null)
  // This change began with a first code, so the new number's step is the second of two.
  const [secondOfTwo, setSecondOfTwo] = useState(false)
  const wait = useCountdown()

  // The one phone rule: with a country code, spaces and hyphens ignored; the number goes out as
  // plain E.164. A +91 number is ten digits starting 6 to 9.
  const reading = readPhone(draft)
  const typed = reading.ok ? reading.e164 : ''
  const draftError = draft.trim() && !reading.ok ? reading.message : undefined
  const canSend = reading.ok && !asking && wait.secondsLeft === 0

  function showFailure(error: unknown, fallback: string) {
    setRequestError(error instanceof Error ? error.message : fallback)
    const seconds = retryAfterSeconds(error)
    if (seconds) wait.start(seconds)
  }

  /** Opens the first-code step, with the contacts the server named. */
  function openFirstStep(intent: Intent, channels: StepUpChannel[]) {
    setRequestError(null)
    setConfirmingRemove(false)
    setEditing(false)
    setPending(null)
    setFirstStep({ intent, channels, channel: channels[0]?.channel ?? 'phone' })
  }

  /**
   * A change the server refused for want of a first code (the proof ran out, or was used): the
   * same first step, with the contacts the refusal carries. False when the refusal is not that.
   */
  function refusedForFirstCode(intent: Intent, error: unknown): boolean {
    const channels = stepUpChannelsFrom(error)
    if (!channels) return false
    openFirstStep(intent, channels)
    return true
  }

  async function ask(number: string): Promise<boolean> {
    setAsking(true)
    setRequestError(null)
    try {
      const answer = await requestCode.mutateAsync(number)
      setPending({ phone: number, resendAfter: answer?.resend_after_seconds })
      return true
    } catch (error) {
      if (!refusedForFirstCode('change', error)) showFailure(error, 'Could not send a code. Try again.')
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

  /**
   * Change or Remove on a verified number: ask whether a first code is needed before anything
   * else, so the two steps are on screen before the person starts. Not needed (or already proved
   * a moment ago and still good): straight on, as before.
   */
  async function begin(intent: Intent) {
    const goOn = () => {
      setSecondOfTwo(false)
      if (intent === 'change') startAdd()
      else setConfirmingRemove(true)
    }
    if (!verified) return goOn()
    setChecking(intent)
    setRequestError(null)
    try {
      const answer = await checkStepUp.mutateAsync()
      if (answer?.required === true && !answer.granted) openFirstStep(intent, answer.channels ?? [])
      else goOn()
    } catch (error) {
      showFailure(error, 'Could not check your number. Try again.')
    } finally {
      setChecking(null)
    }
  }

  async function sendFirstCode() {
    if (!firstStep) return
    setAsking(true)
    setRequestError(null)
    try {
      const answer = await requestFirstCode.mutateAsync(firstStep.channel)
      const chosen = firstStep.channels.find((c) => c.channel === firstStep.channel)
      setFirstCode({
        sentTo: answer?.destination_mask ?? chosen?.destination_mask ?? 'your contact',
        resendAfter: answer?.resend_after_seconds,
      })
    } catch (error) {
      showFailure(error, 'Could not send a code. Try again.')
    } finally {
      setAsking(false)
    }
  }

  /** The first code was right: go on to what the person set out to do. */
  function afterFirstCode(intent: Intent) {
    setFirstCode(null)
    setFirstStep(null)
    if (intent === 'remove') return remove()
    setSecondOfTwo(true)
    setRequestError(null)
    // A number already typed (the proof ran out mid-change) is kept.
    setEditing(true)
  }

  async function startVerify() {
    if (!phone) return
    const stored = readPhone(phone)
    if (stored.ok) {
      await ask(stored.e164)
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
    setSecondOfTwo(false)
  }

  function remove() {
    removePhone.mutate(
      { phone: null },
      {
        onSuccess: () => {
          setConfirmingRemove(false)
          showToast('Phone number removed')
        },
        onError: (error) => {
          if (!refusedForFirstCode('remove', error)) showFailure(error, 'Could not remove your number. Try again.')
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

      {!editing && !firstStep && phone && (
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
              <Button
                size="sm"
                variant="secondary"
                loading={checking === 'change'}
                disabled={checking !== null}
                onClick={() => begin('change')}
              >
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
                <Button
                  size="sm"
                  variant="secondary"
                  loading={checking === 'remove' || removePhone.isPending}
                  disabled={checking !== null}
                  onClick={() => begin('remove')}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
          {!verified && <p className="text-caption text-text-secondary">{UNVERIFIED_NOTE}</p>}
        </>
      )}

      {!editing && !firstStep && !phone && (
        <div className="flex flex-wrap items-center gap-sm">
          <p className="text-body-sm text-text-secondary">No phone number on your account yet.</p>
          <Button size="sm" className="ml-auto" onClick={startAdd}>
            Add phone number
          </Button>
        </div>
      )}

      {firstStep && (
        <div className="flex flex-col gap-sm rounded-md border border-border bg-background p-md">
          <p className="text-body-sm font-medium text-text-primary">
            {firstStep.intent === 'change'
              ? 'Changing your number takes two codes'
              : 'Removing your number takes a code'}
          </p>
          <p className="text-body-sm text-text-secondary">
            {firstStep.intent === 'change' ? TWO_CODES_NOTE : REMOVE_CODE_NOTE}
          </p>
          {firstStep.channels.length > 1 ? (
            <fieldset className="flex flex-col gap-xs">
              <legend className="text-caption text-text-secondary">
                {firstStep.intent === 'change' ? 'Send the first code to' : 'Send the code to'}
              </legend>
              {firstStep.channels.map((c) => (
                <label key={c.channel} className="flex items-center gap-sm text-body-sm text-text-primary">
                  <input
                    type="radio"
                    name="first-code-channel"
                    checked={firstStep.channel === c.channel}
                    onChange={() => setFirstStep({ ...firstStep, channel: c.channel })}
                  />
                  {channelLabel(c)}
                </label>
              ))}
            </fieldset>
          ) : (
            firstStep.channels[0] && (
              <p className="text-body-sm text-text-primary">
                {firstStep.intent === 'change' ? 'The first code goes to: ' : 'The code goes to: '}
                <span className="font-medium">{channelLabel(firstStep.channels[0])}</span>
              </p>
            )
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
            <Button
              variant="secondary"
              onClick={() => {
                setFirstStep(null)
                closeEditor()
              }}
            >
              Cancel
            </Button>
            <Button loading={asking} disabled={wait.secondsLeft > 0} onClick={sendFirstCode}>
              {firstStep.intent === 'change' ? 'Send first code' : 'Send code'}
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <form onSubmit={handleSend} className="flex flex-col gap-sm" noValidate>
          {secondOfTwo && (
            <p role="status" className="text-body-sm font-medium text-text-primary">
              Step 2 of 2: your new number
            </p>
          )}
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

      {!editing && !firstStep && requestError && (
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

      {firstStep && firstCode && (
        <OneTimeCodeDialog
          title={firstStep.intent === 'change' ? 'Step 1 of 2: confirm it is you' : 'Confirm it is you'}
          sentTo={firstCode.sentTo}
          initialResendSeconds={firstCode.resendAfter}
          verifyLabel={firstStep.intent === 'change' ? 'Continue' : 'Remove number'}
          onVerify={async (code) => {
            await verifyFirstCode.mutateAsync(code)
            afterFirstCode(firstStep.intent)
          }}
          onResend={async () => {
            const answer = await requestFirstCode.mutateAsync(firstStep.channel)
            return answer?.resend_after_seconds
          }}
          onClose={() => setFirstCode(null)}
        />
      )}

      {pending && (
        <OneTimeCodeDialog
          title="Verify your phone number"
          sentTo={pending.phone}
          initialResendSeconds={pending.resendAfter}
          onVerify={async (code) => {
            try {
              await verifyCode.mutateAsync({ phone: pending.phone, code })
            } catch (error) {
              // The first code's 15 minutes ran out while this one was being typed: back to it,
              // with the number kept. Anything else is the dialog's to show.
              if (refusedForFirstCode('change', error)) return
              throw error
            }
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
