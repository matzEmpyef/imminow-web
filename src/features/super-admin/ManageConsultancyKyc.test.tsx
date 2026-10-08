import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review I-010: the reviewer can turn a waiting certificate down with a reason. A verified one
// cannot be rejected (the server answers 409), so Reject is offered for a pending one only.
vi.mock('@/queries/kyc', () => ({ useConsultancyKyc: vi.fn(), useVerifyKyc: vi.fn(), useRejectKyc: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useConsultancyKyc, useRejectKyc, useVerifyKyc } from '@/queries/kyc'
import { KycSection } from './ManageConsultancyKyc'

const reject = vi.fn()
const verify = vi.fn()

function mutation(mutate: unknown, error: Error | null = null) {
  return { mutate, reset: vi.fn(), isPending: false, isError: Boolean(error), error } as never
}

function show(kyc: Record<string, unknown>) {
  vi.mocked(useConsultancyKyc).mockReturnValue({ data: kyc } as never)
  render(<KycSection consultancyId="c1" kycVerified={kyc.status === 'verified'} />)
}

const pending = { status: 'pending', document_url: 'https://s/c.pdf', document_content_type: 'application/pdf' }

beforeEach(() => {
  reject.mockReset()
  verify.mockReset()
  vi.mocked(useVerifyKyc).mockReturnValue(mutation(verify))
  vi.mocked(useRejectKyc).mockReturnValue(mutation(reject))
})

describe('KYC review — rejecting a certificate', () => {
  it('needs a reason, and sends it', () => {
    show(pending)
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    const send = screen.getByRole('button', { name: 'Reject certificate' })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Reason for rejecting/), { target: { value: '  The name does not match.  ' } })
    expect(send).toBeEnabled()
    fireEvent.click(send)
    expect(reject.mock.calls[0][0]).toEqual({ consultancyId: 'c1', reason: 'The name does not match.' })
  })

  it('a rejected certificate reads Rejected, with the date and the reason', () => {
    show({ ...pending, status: 'rejected', rejected_at: '2026-10-08T09:00:00Z', rejected_reason: 'The name does not match.' })
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.getByText('Rejected on 08/10/2026: The name does not match.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('offers no Reject once the certificate is verified', () => {
    show({ ...pending, status: 'verified' })
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument()
  })

  it('shows the server’s sentence when the certificate was reviewed in the meantime', () => {
    vi.mocked(useRejectKyc).mockReturnValue(
      mutation(reject, new ApiError('x', { error: { code: 'already_reviewed', message: 'This certificate is already verified.' } }, 409)),
    )
    show(pending)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getByText('This certificate is already verified.')).toBeInTheDocument()
  })
})
