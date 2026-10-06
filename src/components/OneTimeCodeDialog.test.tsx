import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { INVALID_CODE_MESSAGE, OneTimeCodeDialog } from './OneTimeCodeDialog'

// The shared step where someone types a one-time code (first user: adding a phone number on My
// Account). Pinned: what it sends, the three refusals every code route shares, and the two timers
// (Resend, and Verify after a 429).

function refusal(status: number, code: string, message: string, retryAfter?: number) {
  return new ApiError('fallback', { error: { code, message, details: retryAfter ? { retry_after_seconds: retryAfter } : undefined } }, status)
}

function renderDialog(props: Partial<React.ComponentProps<typeof OneTimeCodeDialog>> = {}) {
  const onVerify = vi.fn().mockResolvedValue(undefined)
  const onResend = vi.fn().mockResolvedValue(30)
  const onClose = vi.fn()
  render(
    <OneTimeCodeDialog
      title="Verify your phone number"
      sentTo="+919876543210"
      initialResendSeconds={30}
      onVerify={onVerify}
      onResend={onResend}
      onClose={onClose}
      {...props}
    />,
  )
  return { onVerify, onResend, onClose }
}

const codeBox = () => screen.getByLabelText(/^Code/)
const verifyButton = () => screen.getByRole('button', { name: 'Verify' })

async function type(code: string) {
  await act(async () => {
    fireEvent.change(codeBox(), { target: { value: code } })
  })
}

async function submit() {
  await act(async () => {
    fireEvent.click(verifyButton())
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the one-time code dialog', () => {
  it('says where the code went and keeps Verify off until all six digits are in', async () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: 'Verify your phone number' })).toHaveTextContent('+919876543210')
    expect(verifyButton()).toBeDisabled()
    await type('12345')
    expect(verifyButton()).toBeDisabled()
    await type('123456')
    expect(verifyButton()).toBeEnabled()
  })

  it('takes digits only', async () => {
    renderDialog()
    await type('12a 4-5b6789')
    expect(codeBox()).toHaveValue('124567')
  })

  it('sends the code', async () => {
    const { onVerify } = renderDialog()
    await type('123456')
    await submit()
    expect(onVerify).toHaveBeenCalledWith('123456')
  })

  it('answers a wrong or expired code in the one sentence, and lets them try again at once', async () => {
    const { onVerify } = renderDialog()
    onVerify.mockRejectedValueOnce(refusal(400, 'invalid_otp', 'Server words that must not be shown.'))
    await type('123456')
    await submit()
    expect(screen.getByText('That code is incorrect or has expired. Request a new code.')).toBeInTheDocument()
    expect(INVALID_CODE_MESSAGE).toBe('That code is incorrect or has expired. Request a new code.')
    expect(codeBox()).toHaveAttribute('aria-invalid', 'true')
    await type('654321')
    expect(screen.queryByText(INVALID_CODE_MESSAGE)).not.toBeInTheDocument()
    expect(verifyButton()).toBeEnabled()
  })

  it('shows any other refusal in the server’s words', async () => {
    const { onVerify } = renderDialog()
    onVerify.mockRejectedValueOnce(refusal(400, 'too_many_attempts', 'That code has been tried too many times. Request a new code.'))
    await type('123456')
    await submit()
    expect(screen.getByText('That code has been tried too many times. Request a new code.')).toBeInTheDocument()
  })

  it('on a 429 shows the server’s sentence and switches Verify off until the wait is over', async () => {
    const { onVerify } = renderDialog()
    onVerify.mockRejectedValueOnce(refusal(429, 'rate_limited', 'Too many incorrect codes. Try again later.', 90))
    await type('123456')
    await submit()
    expect(screen.getByText('Too many incorrect codes. Try again later.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('You can try again in 1m 30s.')
    await type('654321')
    expect(verifyButton()).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(89_000)
    })
    expect(verifyButton()).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })
    expect(verifyButton()).toBeEnabled()
    expect(screen.queryByText(/You can try again in/)).not.toBeInTheDocument()
  })

  it('holds Resend for the wait the server gave, then sends the code again without calling the old one void', async () => {
    const { onResend } = renderDialog({ initialResendSeconds: 30 })
    const resend = () => screen.getByRole('button', { name: /^Send/ })
    expect(resend()).toBeDisabled()
    expect(resend()).toHaveTextContent('Send again in 30s')
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(resend()).toHaveTextContent('Send again in 20s')
    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })
    expect(resend()).toBeEnabled()
    expect(resend()).toHaveTextContent('Send the code again')

    await act(async () => {
      fireEvent.click(resend())
    })
    expect(onResend).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Sent again to +919876543210.')).toBeInTheDocument()
    expect(resend()).toBeDisabled()
    expect(document.body).not.toHaveTextContent(/void|no longer (work|valid)|invalid/i)
  })

  it('on a 429 for the resend shows the server’s sentence and keeps Resend off for the time given', async () => {
    const { onResend } = renderDialog({ initialResendSeconds: 0 })
    onResend.mockRejectedValueOnce(refusal(429, 'rate_limited', 'Too many codes requested. Try again after 14:30.', 120))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send the code again' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Too many codes requested. Try again after 14:30.')
    expect(screen.getByRole('button', { name: /^Send again in 2m 00s/ })).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(121_000)
    })
    expect(screen.getByRole('button', { name: 'Send the code again' })).toBeEnabled()
  })

  it('the cooldown message from the server reads as given', async () => {
    const { onResend } = renderDialog({ initialResendSeconds: 0 })
    onResend.mockRejectedValueOnce(refusal(429, 'rate_limited', 'Wait 12s before requesting another code.', 12))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send the code again' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Wait 12s before requesting another code.')
    expect(screen.getByRole('button', { name: /^Send again in 12s/ })).toBeDisabled()
  })

  it('closes through Cancel', async () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
