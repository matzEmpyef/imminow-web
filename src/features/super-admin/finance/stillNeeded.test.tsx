import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 9 console sitting: a Finance box greys its button and says "Still needed: …" while
// anything is invalid, and the messages beside the fields stay up until they are fixed. "Add
// amount due" used to leave Add enabled with 3 decimals and a 2-character reason, and cleared the
// reason's message once Add was clicked.
vi.mock('@/queries/financeDashboard', () => ({
  useAddCommissionDue: vi.fn(),
  useOverrideCommissionDue: vi.fn(),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useAddCommissionDue, useOverrideCommissionDue } from '@/queries/financeDashboard'
import { AddDueModal } from './AddDueModal'
import { OverrideDueModal } from './OverrideDueModal'

const mutate = vi.fn()
const mutation = { mutate, reset: vi.fn(), isPending: false, isError: false, error: null } as never
const caseRow = { id: 'e1', applicant_name: 'Aiko Tanaka', consultancy_name: 'Alpha Consult', by_currency: [] } as never

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useAddCommissionDue).mockReturnValue(mutation)
  vi.mocked(useOverrideCommissionDue).mockReturnValue(mutation)
})

describe('Add amount due', () => {
  const add = () => screen.getByRole('button', { name: 'Add' })

  it('is greyed with the Still needed line while the amount and the reason are missing', () => {
    render(<AddDueModal caseRow={caseRow} onClose={() => {}} onAdded={() => {}} />)
    expect(add()).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Still needed: an amount, the reason.')
  })

  it('stays greyed with a third decimal and a short reason, and both messages stay up', () => {
    render(<AddDueModal caseRow={caseRow} onClose={() => {}} onAdded={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '12.345' } })
    const reason = screen.getByLabelText(/Reason/)
    fireEvent.change(reason, { target: { value: 'ab' } })
    fireEvent.blur(reason)
    expect(add()).toBeDisabled()
    expect(screen.getByText(/two decimal places/i)).toBeInTheDocument()
    expect(screen.getByText('Enter 3 to 2000 characters.')).toBeInTheDocument()
    // Clicking the greyed button does nothing, and nothing is cleared.
    fireEvent.click(add())
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/two decimal places/i)).toBeInTheDocument()
    expect(screen.getByText('Enter 3 to 2000 characters.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Still needed: an amount, the reason.')
  })

  it('is greyed above the largest amount the server takes', () => {
    render(<AddDueModal caseRow={caseRow} onClose={() => {}} onAdded={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '1000000000' } })
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Second instalment' } })
    expect(add()).toBeDisabled()
  })

  it('turns on, and loses the line, once both are right', () => {
    render(<AddDueModal caseRow={caseRow} onClose={() => {}} onAdded={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '12.34' } })
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Second instalment' } })
    expect(add()).toBeEnabled()
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(add())
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})

describe('Override the calculated share', () => {
  const override = { ...(caseRow as object), due_schedule: [] } as never

  it('is greyed with the Still needed line until the amount and the reason are right', () => {
    render(<OverrideDueModal caseRow={override} mode="override" onClose={() => {}} onChanged={() => {}} />)
    const save = screen.getByRole('button', { name: 'Save override' })
    expect(save).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Still needed: an amount, the reason.')
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Agreed with the college' } })
    // Zero is a share set to nothing: allowed here, and the field does not call it wrong.
    expect(save).toBeEnabled()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '1.234' } })
    expect(save).toBeDisabled()
  })

  it('asks only for the reason when the override is being removed', () => {
    render(<OverrideDueModal caseRow={override} mode="clear" onClose={() => {}} onChanged={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Still needed: the reason.')
  })
})
