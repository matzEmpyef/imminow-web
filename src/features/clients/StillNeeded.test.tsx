import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// T4-14: a button that is greyed out says what is missing, and Close Case does not announce a
// success before the "Did the student join?" question is answered.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { StillNeeded } from '@/components/StillNeeded'
import { RaiseIssueModal } from './RaiseIssueModal'
import { CloseClientModal } from './CloseClientModal'
import { AddPhonebookContactModal } from '@/features/administration/AddPhonebookContactModal'

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('StillNeeded', () => {
  it('lists what is missing, and shows nothing when nothing is', () => {
    const { container, rerender } = render(<StillNeeded items={['a name', 'a phone number']} />)
    expect(screen.getByText('Still needed: a name, a phone number.')).toBeInTheDocument()
    rerender(<StillNeeded items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Raise an Issue', () => {
  it('says what is missing until the reason is typed', () => {
    wrap(<RaiseIssueModal clientId="c1" clientName="Riya Pillai" onClose={() => {}} />)
    expect(screen.getByText('Still needed: what has happened.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raise Issue' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/What.s happened/), { target: { value: 'No reply for weeks' } })
    expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raise Issue' })).toBeEnabled()
  })
})

describe('Close Case', () => {
  it('does not say "success" until the student-joined question is answered', () => {
    wrap(
      <CloseClientModal
        clientId="c1"
        clientName="Riya Pillai"
        caseType="student"
        hasAcceptedCollege
        contributionRecorded={false}
        canOpenCommissions
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText(/closes as a/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close as Success' })).not.toBeInTheDocument()
    expect(screen.getByText(/Still needed: whether the student joined, the notes\./)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Yes'))
    expect(screen.getByText(/This closes as a/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close as Success' })).toBeInTheDocument()
  })
})

describe('Add Contact', () => {
  it('turns the button on as soon as a category is typed, without pressing Enter', () => {
    wrap(<AddPhonebookContactModal categories={['Vendor']} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Raj' } })
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '+91 98765 43210' } })
    expect(screen.getByText('Still needed: a category.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Contact' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'Courier' } })
    expect(screen.getByRole('button', { name: 'Add Contact' })).toBeEnabled()
  })
})
