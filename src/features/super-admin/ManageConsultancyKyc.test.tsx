import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review I-010: the reviewer can turn a waiting certificate down with a reason. A verified one
// cannot be rejected (the server answers 409), so Reject is offered for a pending one only.
vi.mock('@/queries/kyc', () => ({
  useConsultancyKyc: vi.fn(),
  useVerifyKyc: vi.fn(),
  useRejectKyc: vi.fn(),
  KYC_NEWER_CERTIFICATE_NOTICE: 'A newer certificate was submitted. Please review it.',
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { KYC_NEWER_CERTIFICATE_NOTICE, useConsultancyKyc, useRejectKyc, useVerifyKyc } from '@/queries/kyc'
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

const pending = {
  status: 'pending',
  document_url: 'https://s/c.pdf',
  document_content_type: 'application/pdf',
  uploaded_at: '2026-10-08T08:15:00.123456Z',
}

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
    // Reject names the certificate on screen by its upload time, as Verify does.
    expect(reject.mock.calls[0][0]).toEqual({
      consultancyId: 'c1',
      reason: 'The name does not match.',
      uploadedAt: '2026-10-08T08:15:00.123456Z',
    })
  })

  it('a rejected certificate reads KYC rejected, with the date and the reason', () => {
    show({ ...pending, status: 'rejected', rejected_at: '2026-10-08T09:00:00Z', rejected_reason: 'The name does not match.' })
    expect(screen.getByText('KYC rejected')).toBeInTheDocument()
    expect(screen.getByText('Rejected on 08-10-2026: The name does not match.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  // Review 2.115: rejected is its own state. The contract allows verifying a pending certificate
  // only, so a rejected one waits for the consultancy's new upload.
  it('offers neither Verify nor Reject on a rejected certificate, and says what happens next', () => {
    show({ ...pending, status: 'rejected', rejected_at: '2026-10-08T09:00:00Z', rejected_reason: 'Blurred.' })
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    expect(screen.getByText('Waiting for the consultancy to submit a new certificate.')).toBeInTheDocument()
  })

  it('offers no Reject once the certificate is verified', () => {
    show({ ...pending, status: 'verified' })
    expect(screen.getByText('KYC verified')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument()
  })

  it('offers no Reject until the upload time of the certificate is known', () => {
    show({ ...pending, uploaded_at: null })
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
  })

  it('closes the reason box and shows the server’s sentence when a 409 comes back', () => {
    reject.mockImplementation((_vars, options) =>
      options.onError(new ApiError('x', { error: { code: 'conflict', message: 'The consultancy has submitted a newer certificate.' } }, 409)),
    )
    show(pending)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByLabelText(/Reason for rejecting/), { target: { value: 'Blurred.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject certificate' }))
    expect(screen.queryByLabelText(/Reason for rejecting/)).not.toBeInTheDocument()
    expect(screen.getByText('The consultancy has submitted a newer certificate.')).toBeInTheDocument()
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

// Review F-207: Verify names the certificate the reviewer is looking at, by the `uploaded_at` the
// review row was served. A newer certificate submitted in the meantime is never verified unseen.
describe('KYC review — verifying a certificate', () => {
  it('sends the upload time of the certificate on screen, exactly as it was served', () => {
    show(pending)
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    expect(verify.mock.calls[0][0]).toEqual({ consultancyId: 'c1', uploadedAt: '2026-10-08T08:15:00.123456Z' })
  })

  it('offers no Verify until the upload time of the certificate is known', () => {
    show({ ...pending, uploaded_at: null })
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    expect(verify).not.toHaveBeenCalled()
  })

  it('asks the reviewer to look at the newer certificate when one was submitted meanwhile', () => {
    vi.mocked(useVerifyKyc).mockReturnValue(
      mutation(verify, new ApiError(KYC_NEWER_CERTIFICATE_NOTICE, { error: { code: 'conflict' } }, 409)),
    )
    show(pending)
    expect(screen.getByText('A newer certificate was submitted. Please review it.')).toBeInTheDocument()
  })

  it('a PDF certificate is a download link that stays in this tab', () => {
    show(pending)
    const link = screen.getByRole('link', { name: 'Download certificate (PDF)' })
    expect(link).toHaveAttribute('href', 'https://s/c.pdf')
    expect(link).not.toHaveAttribute('target')
  })
})
