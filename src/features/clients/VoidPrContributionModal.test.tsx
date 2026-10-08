import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-081: a PR contribution recorded with the wrong amount or currency is voided with a
// reason. The server refuses once money is recorded against it; its sentence is shown as it is.
vi.mock('@/queries/clients', () => ({ useVoidPrCommissionEntry: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useVoidPrCommissionEntry } from '@/queries/clients'
import { VoidPrContributionModal } from './VoidPrContributionModal'

const mutate = vi.fn()
const contribution = { amount: 50000, currency: 'INR' } as never

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useVoidPrCommissionEntry).mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never)
})

describe('VoidPrContributionModal', () => {
  it('keeps Void disabled until a reason is given, then sends it trimmed', () => {
    render(<VoidPrContributionModal clientId="c1" contribution={contribution} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Void contribution — INR 50,000' })).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Void contribution' })
    expect(button).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: '  Recorded in the wrong currency  ' } })
    fireEvent.click(button)
    expect(mutate.mock.calls[0][0]).toBe('Recorded in the wrong currency')
  })

  it.each([
    ['part_settled', 'A payment is recorded against this contribution. Void it first.'],
    ['conflict', 'A college acceptance is undone by reverting it.'],
  ])('shows the server’s sentence on 409 %s', (code, message) => {
    vi.mocked(useVoidPrCommissionEntry).mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      error: new ApiError('Could not void the contribution.', { error: { code, message } }, 409),
    } as never)
    render(<VoidPrContributionModal clientId="c1" contribution={contribution} onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(message)
  })
})
