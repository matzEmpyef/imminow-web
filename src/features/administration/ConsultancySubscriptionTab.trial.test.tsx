import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// T4-37: a college on its free trial is told so, with the end date, instead of "Active" and 0.00.
vi.mock('@/queries/consultancy', () => ({
  useMyConsultancy: vi.fn(),
  useRequestRenewal: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useRequestUpgrade: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useWithdrawUpgrade: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))
vi.mock('@/queries/staff', () => ({ useActiveEmployeeCount: () => ({ data: 2 }) }))

import { SubscriptionTab } from './ConsultancySubscriptionTab'

const base = {
  id: 'c1',
  tier: 'starter',
  seat_limit: 5,
  features: {},
  subscription_status: 'active',
  subscription_expires_at: '2099-07-18T00:00:00Z',
  subscription_started_at: null,
  billing_cycle: null,
  subscription_amount: 0,
  billing_currency: 'INR',
}

describe('Subscription tab, trial', () => {
  it('shows a free trial with its end date and no empty lines', () => {
    render(<SubscriptionTab consultancy={base as never} />)
    expect(screen.getByText('Free trial')).toBeInTheDocument()
    expect(screen.getByText('Free trial ends')).toBeInTheDocument()
    expect(screen.getByText(/18-07-2099/)).toBeInTheDocument()
    expect(screen.getByText('Nothing is charged during the free trial.')).toBeInTheDocument()
    expect(screen.queryByText('Plan started')).not.toBeInTheDocument()
    expect(screen.queryByText('Billing cycle')).not.toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('keeps Active, the cycle and the amount for a paid term', () => {
    render(
      <SubscriptionTab
        consultancy={{ ...base, billing_cycle: 'annual', subscription_amount: 12000, subscription_started_at: '2099-01-01T00:00:00Z' } as never}
      />,
    )
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Billing cycle')).toBeInTheDocument()
    expect(screen.queryByText('Free trial')).not.toBeInTheDocument()
  })
})
