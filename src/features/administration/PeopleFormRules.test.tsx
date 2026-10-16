import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 154 on the people forms of a consultancy: Invite Employee, Edit Employee and the
// Phonebook. Names follow the name rule (any script, no digits, 100 characters), the email is one
// rule, lower-cased and trimmed, a phone typed without a country code is read in the consultancy's
// country (here India, from the test setup), and what the server names sits beside its field. A
// number saved before the rule existed is not flagged until someone edits it.
vi.mock('@/queries/staff', () => ({
  useInviteEmployee: vi.fn(),
  useUpdateEmployee: vi.fn(),
}))
vi.mock('@/queries/phonebook', () => ({
  useCreatePhonebookContact: vi.fn(),
  useUpdatePhonebookContact: vi.fn(),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useInviteEmployee, useUpdateEmployee } from '@/queries/staff'
import { useCreatePhonebookContact, useUpdatePhonebookContact } from '@/queries/phonebook'
import { InviteEmployeeModal } from './InviteEmployeeModal'
import { EditEmployeeModal } from './EditEmployeeModal'
import { AddPhonebookContactModal } from './AddPhonebookContactModal'

const mutate = vi.fn()

function mutation(error: Error | null = null) {
  return { mutate, isPending: false, isError: Boolean(error), error } as never
}

function refusal(message: string, fields: Record<string, string>) {
  return new ApiError('fallback', { error: { code: 'validation_failed', message, details: { fields } } }, 400)
}

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useInviteEmployee).mockReturnValue(mutation())
  vi.mocked(useUpdateEmployee).mockReturnValue(mutation())
  vi.mocked(useCreatePhonebookContact).mockReturnValue(mutation())
  vi.mocked(useUpdatePhonebookContact).mockReturnValue(mutation())
})

function renderInvite() {
  render(
    <InviteEmployeeModal
      hasDesignations={false}
      designations={[]}
      branches={[]}
      hasMultiBranch={false}
      onClose={() => {}}
    />,
  )
}

describe('Invite Employee', () => {
  it('sends the names trimmed, the email lower-cased and a local phone as +91', () => {
    renderInvite()
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: '  Meera ' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: ' Nair  Menon ' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' Meera@Example.COM ' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '98765-43210' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send Invite' }))
    expect(mutate.mock.calls[0][0]).toMatchObject({
      first_name: 'Meera',
      last_name: 'Nair Menon',
      email: 'meera@example.com',
      phone: '+919876543210',
    })
  })

  it('takes a name in Tamil and refuses one with a digit', () => {
    renderInvite()
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'மீரா' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Nair' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'meera@example.com' } })
    expect(screen.getByRole('button', { name: 'Send Invite' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Nair 2' } })
    expect(screen.getByRole('button', { name: 'Send Invite' })).toBeDisabled()
  })

  it('stops the email at 254 characters', () => {
    renderInvite()
    const email = screen.getByLabelText('Email') as HTMLInputElement
    fireEvent.change(email, { target: { value: `${'a'.repeat(300)}@example.com` } })
    expect(email.value).toHaveLength(254)
  })

  it('shows the sentence the server names beside the phone, and not again in the footer', () => {
    vi.mocked(useInviteEmployee).mockReturnValue(
      mutation(refusal('Check the details.', { phone: 'That number is already used by another employee.' })),
    )
    renderInvite()
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByText('That number is already used by another employee.')).toHaveLength(1)
    expect(screen.queryByText('Check the details.')).not.toBeInTheDocument()
    // The sentence was about what was sent: it goes once the field is changed.
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+919876543211' } })
    expect(screen.queryByText('That number is already used by another employee.')).not.toBeInTheDocument()
  })
})

describe('Edit Employee', () => {
  const employee = (phone: string | null) =>
    ({
      id: 'e1',
      version: 1,
      user: { first_name: 'Meera', last_name: 'Nair', phone, designation: null },
    }) as never

  function open(phone: string | null) {
    render(<EditEmployeeModal employee={employee(phone)} designations={[]} hasDesignations={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Meera Nair' }))
  }

  it('does not flag a number saved before the rule existed until it is edited', () => {
    open('098 765 43210 ext 4')
    fireEvent.blur(screen.getByLabelText('Phone'))
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
    expect(screen.getByLabelText('Phone')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('holds an edited number to the rule', () => {
    open('+919876543210')
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '5876543210' } })
    expect(screen.getByText('An Indian (+91) number has 10 digits and starts with 6, 7, 8 or 9.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  it('sends the name trimmed', () => {
    open(null)
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: '  Meenakshi ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(mutate.mock.calls[0][0]).toMatchObject({ first_name: 'Meenakshi' })
  })
})

describe('Phonebook', () => {
  it('sends the contact trimmed, the email lower-cased and the phone as +91', () => {
    render(<AddPhonebookContactModal categories={['Vendor']} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: '  Anand Travels ' } })
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: ' Vendor ' } })
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '98765 43210' } })
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: ' A@Example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }))
    expect(mutate.mock.calls[0][0]).toEqual({
      name: 'Anand Travels',
      category: 'Vendor',
      phone: '+919876543210',
      email: 'a@example.com',
    })
  })

  it('keeps a bad email out', () => {
    render(<AddPhonebookContactModal categories={[]} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Anand' } })
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'Vendor' } })
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '98765 43210' } })
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'anand@' } })
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Contact' })).toBeDisabled()
  })
})
