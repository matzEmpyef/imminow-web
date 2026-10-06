import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/queries/visitRequests', () => ({
  useNudgeVisitRequest: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}))

import { VisitRequestDrawer } from './VisitRequestDrawer'

const REQUEST = {
  id: 'vr-1',
  context: { name: 'Asha Menon' },
  student_email: 'asha.menon@example.com',
  student_phone: '+91 98765 43210',
  consultancy_name: 'Bright Path',
  consultancy_contact: { name: 'Ravi Nair', email: 'ravi@brightpath.example', phone: '+91 91234 56789', assigned: true },
  proposed_date: '2026-10-20',
  proposed_time: '11:00',
  created_at: '2026-10-01T10:00:00Z',
  waiting_hours: 5,
  responded: false,
  nudge_count: 0,
} as never

describe('VisitRequestDrawer copy controls', () => {
  it('puts a copy button beside the student email and phone and the consultancy contact email and phone', () => {
    render(
      <MemoryRouter>
        <VisitRequestDrawer request={REQUEST} onClose={vi.fn()} onUpdated={vi.fn()} />
      </MemoryRouter>,
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByRole('button', { name: 'Copy email address' })).toHaveLength(2)
    expect(within(dialog).getAllByRole('button', { name: 'Copy phone number' })).toHaveLength(2)
    const studentEmail = screen.getByRole('link', { name: 'asha.menon@example.com' })
    expect(within(studentEmail.parentElement!).getByRole('button', { name: 'Copy email address' })).toBeTruthy()
    const studentPhone = screen.getByRole('link', { name: '+91 98765 43210' })
    expect(within(studentPhone.parentElement!).getByRole('button', { name: 'Copy phone number' })).toBeTruthy()
  })
})
