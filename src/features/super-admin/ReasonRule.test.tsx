import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 154: a reason or note is 3 to 2000 characters once trimmed, on every form, with a
// live counter from 90% of the limit. These three screens used to ask for "anything not empty",
// "at least 3" or nothing at all; they now ask the one shared rule.
const moderate = vi.hoisted(() => ({ mutate: vi.fn(), isError: false, error: null as unknown }))
const voidDue = vi.hoisted(() => ({ mutate: vi.fn(), isError: false, isPending: false, error: null as unknown }))
const closeLead = vi.hoisted(() => ({ mutate: vi.fn(), isError: false, isPending: false, error: null as unknown }))

vi.mock('@/queries/adminReviews', () => ({ useModerateReview: () => moderate }))
vi.mock('@/queries/financeDashboard', () => ({ useVoidCommissionDue: () => voidDue }))
vi.mock('@/queries/leads', () => ({ useCloseLead: () => closeLead }))

import { HideReviewModal } from './HideReviewModal'
import { VoidDueModal } from './finance/VoidDueModal'
import { CloseLeadModal } from '@/features/sales/CloseLeadModal'

beforeEach(() => {
  vi.clearAllMocks()
})

function type(label: RegExp | string, value: string) {
  const field = screen.getByLabelText(label) as HTMLTextAreaElement
  fireEvent.change(field, { target: { value } })
  return field
}

describe('Hide a review', () => {
  function open() {
    render(<HideReviewModal review={{ id: 'r1' } as never} onClose={() => {}} onHidden={() => {}} />)
  }

  it('sends nothing for two characters or only spaces, and says the one sentence', () => {
    open()
    type(/Reason/, 'ab')
    fireEvent.click(screen.getByRole('button', { name: /Hide/ }))
    expect(moderate.mutate).not.toHaveBeenCalled()
    expect(screen.getAllByText('Enter 3 to 2000 characters.').length).toBeGreaterThan(0)
    type(/Reason/, '      ')
    fireEvent.click(screen.getByRole('button', { name: /Hide/ }))
    expect(moderate.mutate).not.toHaveBeenCalled()
  })

  it('sends a reason of three characters, trimmed', () => {
    open()
    type(/Reason/, '  abc  ')
    fireEvent.click(screen.getByRole('button', { name: /Hide/ }))
    expect(moderate.mutate).toHaveBeenCalledTimes(1)
    expect(moderate.mutate.mock.calls[0][0]).toEqual({ status: 'hidden', reason: 'abc' })
  })

  it('stops at 2000 characters and shows the counter near the limit', () => {
    open()
    const field = type(/Reason/, 'x'.repeat(2600))
    expect(field.value).toHaveLength(2000)
    expect(screen.getByText('2000 / 2000')).toBeInTheDocument()
  })

  it('counts a Hindi letter with its vowel sign as one character', () => {
    open()
    // 1999 plain letters plus one letter with a vowel sign (two UTF-16 units): still within 2000.
    const field = type(/Reason/, 'a'.repeat(1999) + 'कि')
    expect(Array.from(field.value)).toHaveLength(2000)
  })
})

describe('Remove an added amount', () => {
  const caseRow = { id: 'case-1', applicant_name: 'Asha' } as never
  const part = { id: 'p1', amount: 100, currency: 'INR' } as never

  function open() {
    render(<VoidDueModal caseRow={caseRow} part={part} onClose={() => {}} onVoided={() => {}} />)
  }

  it('waits for three characters', () => {
    open()
    const remove = screen.getByRole('button', { name: 'Remove' })
    expect(remove).toBeDisabled()
    type(/Reason/, 'ab')
    expect(remove).toBeDisabled()
    type(/Reason/, 'abc')
    expect(remove).toBeEnabled()
  })

  it('refuses a reason of only spaces', () => {
    open()
    type(/Reason/, '        ')
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })
})

describe('Close a lead', () => {
  it('holds the note for "Something else" to the shared reason rule', () => {
    render(<CloseLeadModal leadId="l1" leadName="Asha" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'other' } })
    const submit = screen.getByRole('button', { name: 'Close Lead' })
    expect(submit).toBeDisabled()
    type(/Note/i, 'ab')
    expect(submit).toBeDisabled()
    type(/Note/i, 'abc')
    expect(submit).toBeEnabled()
  })
})
