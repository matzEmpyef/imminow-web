import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// T4-22: a category typed into the Phonebook form is the category saved. It counts as soon as it is
// typed (no Enter, no "+ Add" click), so the Add Contact button is on and sends exactly what was
// typed. The phone field says the one phone sentence, as its help and as its message.
const save = vi.fn()
vi.mock('@/queries/phonebook', () => ({
  useCreatePhonebookContact: () => ({ mutate: save, isPending: false, isError: false, error: null }),
  useUpdatePhonebookContact: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { AddPhonebookContactModal } from './AddPhonebookContactModal'

const PHONE_SENTENCE = 'Enter the phone number with the country code, for example +919876543210.'

beforeEach(() => save.mockReset())

describe('Phonebook: a typed category', () => {
  it('is saved as typed, with no Enter pressed and nothing picked from the list', () => {
    render(<AddPhonebookContactModal categories={['Vendor', 'Other']} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Greenfield' } })
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'Courier' } })
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '+919000033333' } })
    const button = screen.getByRole('button', { name: 'Add Contact' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toMatchObject({ name: 'Greenfield', category: 'Courier', phone: '+919000033333' })
  })

  it('is trimmed when it is sent', () => {
    render(<AddPhonebookContactModal categories={[]} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Greenfield' } })
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: '  Courier  ' } })
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '+919000033333' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }))
    expect(save.mock.calls[0][0]).toMatchObject({ category: 'Courier' })
  })

  it('gives the phone the one phone sentence as its help, and as its message for a bad number', () => {
    render(<AddPhonebookContactModal categories={[]} onClose={() => {}} />)
    expect(screen.getByText(PHONE_SENTENCE)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: 'call me' } })
    expect(screen.getAllByText(PHONE_SENTENCE)).toHaveLength(1)
    expect(screen.getByLabelText(/^Phone/)).toHaveAttribute('aria-invalid', 'true')
  })
})
