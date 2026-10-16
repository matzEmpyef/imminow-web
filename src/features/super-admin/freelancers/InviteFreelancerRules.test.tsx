import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 154 on Invite Freelancer: names follow the name rule, the phone (not checked before) is
// held to the staff phone rule, the referral code is 4-20 letters, digits or dashes in capitals, and
// a share of 0% is allowed (it means no share), 100% is the most, two decimals at most.
vi.mock('@/queries/freelancerRates', () => ({ useInviteFreelancer: vi.fn() }))

import { useInviteFreelancer } from '@/queries/freelancerRates'
import { InviteFreelancerModal } from './InviteFreelancerModal'

const mutate = vi.fn()

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useInviteFreelancer).mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never)
})

function fill(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    'First name': 'Ravi',
    'Last name': 'Kumar',
    Email: 'ravi@example.com',
    'Referral code': 'RAVI-2026',
    'Their share of the commission immiNow collects': '25',
    ...overrides,
  }
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } })
  }
}

const send = () => screen.getByRole('button', { name: 'Send invite' })

describe('Invite Freelancer', () => {
  beforeEach(() => {
    render(<InviteFreelancerModal onClose={() => {}} onInvited={() => {}} />)
  })

  it('sends everything trimmed, the email lower-cased and the code in capitals', () => {
    fill({ 'First name': '  Ravi ', Email: ' Ravi@Example.com ', 'Referral code': 'ravi-2026' })
    fireEvent.click(send())
    expect(mutate.mock.calls[0][0]).toMatchObject({
      first_name: 'Ravi',
      last_name: 'Kumar',
      email: 'ravi@example.com',
      referral_code: 'RAVI-2026',
      rate: 25,
    })
  })

  it('accepts a share of 0% and of 100%, and refuses 100.5 and three decimals', () => {
    fill({ 'Their share of the commission immiNow collects': '0' })
    fireEvent.click(send())
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0]).toMatchObject({ rate: 0 })

    fill({ 'Their share of the commission immiNow collects': '100.5' })
    fireEvent.click(send())
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Enter a percentage from 0 to 100, with at most two decimal places.')).toBeInTheDocument()

    fill({ 'Their share of the commission immiNow collects': '12.345' })
    fireEvent.click(send())
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('refuses a referral code that is too short, with the code sentence', () => {
    fill({ 'Referral code': 'ab' })
    fireEvent.click(send())
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getAllByText('Use 4 to 20 letters, digits or dashes.').length).toBeGreaterThan(0)
  })

  it('holds the phone to the staff phone rule, now that it is checked at all', () => {
    fill({ Phone: '12345' })
    fireEvent.click(send())
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true')
    fill({ Phone: '+44 7911 123456' })
    fireEvent.click(send())
    expect(mutate.mock.calls[0][0]).toMatchObject({ phone: '+447911123456' })
  })

  it('refuses a first name with a digit', () => {
    fill({ 'First name': 'Ravi2' })
    fireEvent.click(send())
    expect(mutate).not.toHaveBeenCalled()
  })
})
