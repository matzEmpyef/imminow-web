import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { countdownText, retryAfterSeconds } from '@/lib/retryAfter'
import { useCountdown } from '@/lib/useCountdown'

/** The one sentence for a wrong, used or expired code (`invalid_otp`). */
export const INVALID_CODE_MESSAGE = 'That code is incorrect or has expired. Request a new code.'

const DEFAULT_RESEND_SECONDS = 30

interface OneTimeCodeDialogProps {
  title: string
  /** Where the code was sent, as the person knows it: "+91 98765 43210". */
  sentTo: string
  /** Digits in the code. The server's codes are 6. */
  codeLength?: number
  /** The answer to the request that opened this dialog (`resend_after_seconds`). */
  initialResendSeconds?: number
  /** Label of the confirm button. */
  verifyLabel?: string
  /**
   * Checks the code. Resolves when it was accepted (the caller then closes the dialog); rejects
   * with an `ApiError` when it was refused, and the dialog shows why: `invalid_otp` in the one
   * sentence above, a 429 `rate_limited` with its wait (Verify stays off until it ends), anything
   * else in the server's words.
   */
  onVerify: (code: string) => Promise<unknown>
  /**
   * Asks for the code again; resolves with the seconds until the next ask is allowed, when the
   * server said. A resend delivers the SAME code, so the dialog never calls the old one void.
   * A 429 rejects with its `ApiError`: its wait disables Resend.
   */
  onResend: () => Promise<number | undefined | void>
  onClose: () => void
}

/**
 * The step where a person types a one-time code they were sent (a phone number being added, and
 * any later place that proves an address by code). Built for reuse: it knows nothing about what
 * the code is for. The caller supplies what to do with the code and how to ask for it again; this
 * holds the typing, the resend timer and the refusals every code route shares.
 */
export function OneTimeCodeDialog({
  title,
  sentTo,
  codeLength = 6,
  initialResendSeconds = DEFAULT_RESEND_SECONDS,
  verifyLabel = 'Verify',
  onVerify,
  onResend,
  onClose,
}: OneTimeCodeDialogProps) {
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)
  const [resentNote, setResentNote] = useState(false)
  const resend = useCountdown()
  const locked = useCountdown()
  const mounted = useRef(true)
  const startResend = resend.start

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    // Once, for the request that opened the dialog.
    startResend(initialResendSeconds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const complete = code.length === codeLength
  const canVerify = complete && !verifying && locked.secondsLeft === 0

  async function handleVerify(e?: FormEvent) {
    e?.preventDefault()
    if (!canVerify) return
    setVerifying(true)
    setVerifyError(null)
    try {
      await onVerify(code)
    } catch (error) {
      if (!mounted.current) return
      const wait = retryAfterSeconds(error)
      if (error instanceof ApiError && error.code === 'rate_limited') {
        setVerifyError(error.message)
        if (wait) locked.start(wait)
      } else if (error instanceof ApiError && error.code === 'invalid_otp') {
        setVerifyError(INVALID_CODE_MESSAGE)
      } else {
        setVerifyError(error instanceof Error ? error.message : 'Could not verify the code. Try again.')
      }
      setVerifying(false)
    }
  }

  async function handleResend() {
    if (resend.secondsLeft > 0 || resending) return
    setResending(true)
    setResendError(null)
    setResentNote(false)
    try {
      const seconds = await onResend()
      if (!mounted.current) return
      resend.start(typeof seconds === 'number' && seconds > 0 ? seconds : DEFAULT_RESEND_SECONDS)
      setResentNote(true)
    } catch (error) {
      if (!mounted.current) return
      const wait = retryAfterSeconds(error)
      setResendError(error instanceof Error ? error.message : 'Could not send the code. Try again.')
      if (wait) resend.start(wait)
    } finally {
      if (mounted.current) setResending(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={title}
      widthRem={26}
      footer={
        <div className="flex gap-sm">
          <Button type="submit" form="one-time-code-form" loading={verifying} disabled={!canVerify}>
            {verifyLabel}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={verifying}>
            Cancel
          </Button>
        </div>
      }
    >
      <form id="one-time-code-form" onSubmit={handleVerify} className="flex flex-col gap-md" noValidate>
        <p className="text-body-sm text-text-secondary">
          We sent a {codeLength}-digit code to <span className="font-medium text-text-primary">{sentTo}</span>. Enter it
          below.
        </p>
        <TextField
          label="Code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={codeLength}
          placeholder={'0'.repeat(codeLength)}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, codeLength))
            setVerifyError(null)
          }}
          error={verifyError ?? undefined}
        />
        {locked.secondsLeft > 0 && (
          <p role="status" className="text-caption text-text-secondary">
            You can try again in {countdownText(locked.secondsLeft)}. Asking for a new code does not shorten the wait.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-sm">
          <Button size="sm" variant="secondary" loading={resending} disabled={resend.secondsLeft > 0} onClick={handleResend}>
            {resend.secondsLeft > 0 ? `Send again in ${countdownText(resend.secondsLeft)}` : 'Send the code again'}
          </Button>
          {resentNote && resend.secondsLeft > 0 && (
            <p role="status" className="text-caption text-text-secondary">
              Sent again to {sentTo}.
            </p>
          )}
        </div>
        {resendError && (
          <p role="alert" className="text-body-sm text-error">
            {resendError}
          </p>
        )}
      </form>
    </Modal>
  )
}
