import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Owner, 2026-10-06: the Phonebook rows carry copy buttons for the phone and the email, revealed
// only while the row is hovered or focused. The hover itself is CSS (group-hover on the row), so
// what is pinned here is the markup that does it, plus presence, absence and the click.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false }) }))
const access = vi.hoisted(() => ({ isAdmin: true }))
vi.mock('@/lib/permissions', () => ({ usePermissionChecker: () => ({ can: () => true, isAdmin: access.isAdmin }) }))
vi.mock('./AddPhonebookContactModal', () => ({ AddPhonebookContactModal: () => null }))
vi.mock('@/queries/phonebook', () => ({
  usePhonebook: () => ({
    isLoading: false,
    isError: false,
    data: {
      items: [
        { id: 'c1', name: 'Anand Travels', category: 'Vendor', phone: '+91 98765 43210', email: 'anand@example.com' },
        { id: 'c2', name: 'No Mail Co', category: 'Vendor', phone: '+91 91234 56789', email: null },
      ],
      meta: { next_cursor: null, categories: ['Vendor'] },
    },
  }),
  useDeletePhonebookContact: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

import { PhonebookPage } from './PhonebookPage'

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
})

function rowOf(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement
}

describe('Phonebook copy buttons', () => {
  it('puts a copy button beside the phone and the email, and leaves the text as it was', () => {
    render(<PhonebookPage />)
    const row = rowOf('Anand Travels')
    expect(within(row).getByRole('button', { name: 'Copy phone number' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Copy email address' })).toBeTruthy()
    expect(within(row).getByText('+91 98765 43210')).toBeTruthy()
    expect(within(row).getByText('anand@example.com')).toBeTruthy()
  })

  it('shows no email copy button when the contact has no email', () => {
    render(<PhonebookPage />)
    const row = rowOf('No Mail Co')
    expect(within(row).getByRole('button', { name: 'Copy phone number' })).toBeTruthy()
    expect(within(row).queryByRole('button', { name: 'Copy email address' })).toBeNull()
    expect(within(row).getByText('—')).toBeTruthy()
  })

  it('hides the buttons by opacity until the row is hovered or focused, and keeps them on touch', () => {
    render(<PhonebookPage />)
    const row = rowOf('Anand Travels')
    expect(row.className).toContain('group')
    const cls = within(row).getByRole('button', { name: 'Copy phone number' }).className
    expect(cls).toContain('opacity-0')
    expect(cls).toContain('group-hover:opacity-100')
    expect(cls).toContain('group-focus-within:opacity-100')
    expect(cls).toContain('[@media(hover:none)]:opacity-100')
  })

  it('copies the value and does not open the delete window or select the row', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<PhonebookPage />)
    const row = rowOf('Anand Travels')
    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: 'Copy email address' }))
    })
    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: 'Copy phone number' }))
    })
    expect(writeText).toHaveBeenNthCalledWith(1, 'anand@example.com')
    expect(writeText).toHaveBeenNthCalledWith(2, '+91 98765 43210')
    expect(screen.queryByText('Delete Contact')).toBeNull()
  })
})

// Owner decision 7 (review F-146): everyone reads the phonebook; only the Owner/Admin removes a
// contact.
describe('removing a phonebook contact', () => {
  afterEach(() => {
    access.isAdmin = true
  })

  it('is offered to the Owner/Admin', () => {
    access.isAdmin = true
    render(<PhonebookPage />)
    expect(screen.getByRole('button', { name: 'Remove Anand Travels' })).toBeTruthy()
  })

  it('is not offered to anyone else, who still sees and copies every contact', () => {
    access.isAdmin = false
    render(<PhonebookPage />)
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
    const row = rowOf('Anand Travels')
    expect(within(row).getByText('+91 98765 43210')).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Copy phone number' })).toBeTruthy()
  })
})
