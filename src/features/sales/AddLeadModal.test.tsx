import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Add Lead, one at a time (review F-208, 2026-10-08): the server checks the name, email and
// phone as it checks an import row, names each field it refuses, and answers the phone as stored.
vi.mock('@/queries/leads', () => ({
  useValidateLeadImport: vi.fn(),
  useCommitLeadImport: vi.fn(),
  useCreateLead: vi.fn(),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useCreateLead } from '@/queries/leads'
import { AddLeadModal } from './ImportLeadsModal'

const mutate = vi.fn()

function mutation(error: Error | null = null) {
  return { mutate, isPending: false, isError: Boolean(error), error } as never
}

function fill(name: string, phone: string, email = '') {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: name } })
  fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: phone } })
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: email } })
}

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useCreateLead).mockReturnValue(mutation())
})

describe('Add Lead — what the server says about the contact', () => {
  it('shows the stored phone as the server returned it', () => {
    render(<AddLeadModal onClose={() => {}} />)
    fill('Asha Nair', '98765 43210')
    fireEvent.click(screen.getByRole('button', { name: 'Add Lead' }))
    expect(mutate.mock.calls[0][0]).toMatchObject({ name: 'Asha Nair', phone: '98765 43210' })

    // The form re-renders when the answer arrives.
    act(() => mutate.mock.calls[0][1].onSuccess({ id: 'l1', name: 'Asha Nair', phone: '+919876543210' }))
    expect(screen.getByRole('status')).toHaveTextContent('Asha Nair added. Phone saved as +919876543210.')
    expect(screen.getByLabelText(/^Phone/)).toHaveValue('')
  })

  it('drops the "added" line as soon as any field is edited', () => {
    const added = () => {
      act(() => mutate.mock.calls.at(-1)![1].onSuccess({ id: 'l1', name: 'Asha Nair', phone: '+919876543210' }))
    }
    const edits: [string, () => void][] = [
      ['name', () => fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'B' } })],
      ['phone', () => fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '9' } })],
      ['email', () => fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'a@b.com' } })],
      ['source', () => fireEvent.change(screen.getByLabelText(/^Source/), { target: { value: 'walk_in' } })],
      ['notes', () => fireEvent.change(screen.getByLabelText(/^Notes/), { target: { value: 'x' } })],
    ]
    render(<AddLeadModal onClose={() => {}} />)
    for (const [, edit] of edits) {
      fill('Asha Nair', '98765 43210')
      fireEvent.click(screen.getByRole('button', { name: 'Add Lead' }))
      added()
      expect(screen.getByRole('status')).toBeInTheDocument()
      edit()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    }
  })

  it('drops the "added" line when the next attempt is submitted, even one that is refused', () => {
    render(<AddLeadModal onClose={() => {}} />)
    fill('Asha Nair', '98765 43210')
    fireEvent.click(screen.getByRole('button', { name: 'Add Lead' }))
    act(() => mutate.mock.calls[0][1].onSuccess({ id: 'l1', name: 'Asha Nair', phone: '+919876543210' }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    // Submitting the empty form (Enter in a field) is refused on the spot, with no request.
    fireEvent.submit(document.getElementById('add-lead-form')!)
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it("puts each refused field's sentence beside that field, until it is changed", () => {
    render(<AddLeadModal onClose={() => {}} />)
    fill('Asha Nair', '98765 43210', 'asha@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Add Lead' }))

    vi.mocked(useCreateLead).mockReturnValue(
      mutation(
        new ApiError('Could not add this lead.', {
          error: {
            code: 'validation_failed',
            message: 'Phone is not a valid number.',
            details: { fields: { phone: 'Phone is not a valid number.', email: 'Email is not a valid address.' } },
            status: 400,
          },
        }),
      ),
    )
    fireEvent.change(screen.getByLabelText(/^Notes/), { target: { value: 'walk-in' } })

    expect(screen.getByLabelText(/^Phone/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true')
    // Once beside its field, the sentence is not repeated in the footer.
    expect(screen.getAllByText('Phone is not a valid number.')).toHaveLength(1)
    expect(screen.getByText('Email is not a valid address.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByRole('button', { name: 'Add Lead' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '+91 98765 43210' } })
    expect(screen.getByLabelText(/^Phone/)).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps a refusal that names no field in the footer', () => {
    vi.mocked(useCreateLead).mockReturnValue(
      mutation(new ApiError('Could not add this lead.', { error: { code: 'feature_locked', message: 'Own leads are part of the Business plan.' } })),
    )
    render(<AddLeadModal onClose={() => {}} />)
    expect(screen.getByText('Own leads are part of the Business plan.')).toBeInTheDocument()
  })
})
