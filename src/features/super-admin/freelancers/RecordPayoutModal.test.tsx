import { fireEvent, render, screen, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The payout's Idempotency-Key lives for as long as the modal is open — but a refused attempt
// (409 more_than_owed) is stored under that key by the server and would be replayed to a corrected
// retry, so a refusal must hand the next submit a fresh key.
vi.mock('@/queries/freelancerReferrals', () => ({ useRecordFreelancerPayout: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useRecordFreelancerPayout } from '@/queries/freelancerReferrals'
import { ApiError } from '@/api/errors'
import { RecordPayoutModal } from './RecordPayoutModal'

const mutate = vi.fn()
const referral = { id: 'r1', applicant_name: 'Asha', owed_inr: 5000, earned_inr: 5000, paid_inr: 0, collected_inr: 50000, rate_percent: 10 }

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useRecordFreelancerPayout).mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never)
})

describe('RecordPayoutModal idempotency key', () => {
  it('reuses the key until the server refuses, then mints a new one', () => {
    render(<RecordPayoutModal referral={referral as never} onClose={() => undefined} />)
    const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Record payout' }))
    submit()
    submit()
    const first = mutate.mock.calls[0][0].idempotencyKey
    expect(mutate.mock.calls[1][0].idempotencyKey).toBe(first)

    const refusal = new ApiError('x', { error: { code: 'more_than_owed', message: 'That is more than the amount owed.' } }, 409)
    act(() => (mutate.mock.calls[1][1] as { onError: (e: unknown) => void }).onError(refusal))
    submit()
    expect(mutate.mock.calls[2][0].idempotencyKey).not.toBe(first)
  })
})
