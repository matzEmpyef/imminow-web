import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// T4-36: the freelancer page does not say "No payments yet" under money that is owed, does not
// promise money on a closed case that earned nothing, and keeps every column on a narrow screen.
vi.mock('@/features/auth/FreelancerShell', () => ({ FreelancerShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
const referrals = vi.hoisted(() => ({
  items: [
    { id: 'r1', applicant_name: 'Rahul', created_at: '2027-02-22T00:00:00Z', stage: 'succeeded', payout_status: 'owed', earned_inr: 1000, paid_inr: 366, owed_inr: 634, commission: { your_cut: 1000, rate_missing: false } },
    { id: 'r2', applicant_name: 'Chetan', created_at: '2026-11-22T00:00:00Z', stage: 'closed', payout_status: 'not_due', earned_inr: 0, paid_inr: 0, owed_inr: 0, commission: null },
  ],
}))
vi.mock('@/queries/freelancerReferrals', () => ({
  fetchAllFreelancerReferrals: vi.fn(),
  useFreelancerMe: () => ({ data: { referral_code: 'ABC', share_url: 'https://x/abc' } }),
  useFreelancerReferral: () => ({ data: { payouts: [] }, isLoading: false, isError: false }),
  useFreelancerReferrals: () => ({
    isLoading: false,
    isError: false,
    data: {
      items: referrals.items,
      meta: { next_cursor: null, total: 2 },
      summary: {
        referred: 2,
        earned_inr: 1000,
        paid_inr: 366,
        owed_inr: 634,
        expected_inr: 1000,
        by_payout_status: { not_due: 1, owed: 1, paid: 0 },
        by_stage: { waiting: 0, with_consultancy: 0, plan_complete: 0, succeeded: 1, moved: 0, closed: 1 },
      },
    },
  }),
}))

import { fireEvent } from '@testing-library/react'
import { FreelancerDashboardPage } from './FreelancerDashboardPage'
import { noPaymentsLine } from './payoutWords'

describe('Freelancer referrals', () => {
  it('reads "Nothing due" for a closed case that earned nothing, and keeps "Not due yet" for the chip', () => {
    render(<FreelancerDashboardPage />)
    const row = screen.getByText('Chetan').closest('tr')!
    expect(row).toHaveTextContent('Nothing due')
    expect(row).not.toHaveTextContent('Not due yet')
    expect(screen.getByText(/Not due yet \(1\)/)).toBeInTheDocument()
  })

  it('shows Your share and Paid at every width (no column is hidden below a breakpoint)', () => {
    render(<FreelancerDashboardPage />)
    for (const name of ['Your share', 'Paid']) {
      const header = screen.getByRole('columnheader', { name })
      expect(header.className).not.toMatch(/hidden/)
    }
  })

  it('says what is owed under an owed referral instead of "No payments yet"', () => {
    render(<FreelancerDashboardPage />)
    fireEvent.click(screen.getByText('Rahul'))
    expect(screen.getByText('immiNow owes you INR 634.00 for this student. The payment will appear here once it is made.')).toBeInTheDocument()
    expect(screen.queryByText(/No payments yet/)).not.toBeInTheDocument()
  })

  it('explains a closed referral and keeps the old line for one still to be paid', () => {
    expect(noPaymentsLine({ stage: 'closed', earned_inr: 0, owed_inr: 0 })).toBe(
      'Nothing will be paid for this student, because the case is closed with no earnings.',
    )
    expect(noPaymentsLine({ stage: 'with_consultancy', earned_inr: 0, owed_inr: 0 })).toMatch(/^No payments yet/)
  })
})
