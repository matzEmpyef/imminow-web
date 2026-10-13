import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A lead closes on the list a case closes on (owner decision 69b, 2026-10-08): the reason is
// picked, the labels are the Close Case ones, and "Something else" needs a note.
vi.mock('@/queries/leads', () => ({ useCloseLead: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useCloseLead } from '@/queries/leads'
import { CLOSE_SUB_REASONS } from '@/queries/clients'
import { closeSubReasonLabel } from '@/lib/clientStatus'
import { CloseLeadModal } from './CloseLeadModal'

const mutate = vi.fn()

function mutation(error: Error | null = null) {
  return { mutate, isPending: false, isError: Boolean(error), error } as never
}

function open() {
  render(<CloseLeadModal leadId="l1" leadName="Asha Nair" onClose={() => {}} />)
}

const submit = () => screen.getByRole('button', { name: 'Close Lead' })

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useCloseLead).mockReturnValue(mutation())
})

describe('Close Lead — reason picker', () => {
  it('offers the server list with the labels Close Case uses', () => {
    open()
    const options = Array.from(screen.getByLabelText<HTMLSelectElement>('Reason').options).slice(1)
    expect(options.map((o) => o.value)).toEqual([
      'rejected_by_colleges',
      'visa_refused',
      'student_withdrew',
      'lost_contact',
      'other',
    ])
    expect(options.map((o) => o.textContent)).toEqual(CLOSE_SUB_REASONS.map((r) => r.label))
    expect(options.map((o) => o.textContent)).toEqual(options.map((o) => closeSubReasonLabel(o.value)))
  })

  it('sends the code, and the note only when one was written', () => {
    open()
    expect(submit()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'lost_contact' } })
    fireEvent.click(submit())
    expect(mutate.mock.calls[0][0]).toEqual({ id: 'l1', reason: 'lost_contact', note: undefined })

    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: '  No reply since May  ' } })
    fireEvent.click(submit())
    expect(mutate.mock.calls[1][0]).toEqual({ id: 'l1', reason: 'lost_contact', note: 'No reply since May' })
  })

  it('waits for a note when the reason is Something else', () => {
    open()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'other' } })
    expect(submit()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Chose a local college' } })
    fireEvent.click(submit())
    expect(mutate.mock.calls[0][0]).toEqual({ id: 'l1', reason: 'other', note: 'Chose a local college' })
  })

  it("shows the server's sentence when it still refuses", () => {
    vi.mocked(useCloseLead).mockReturnValue(
      mutation(
        new ApiError('Could not close this lead.', {
          error: { code: 'validation_failed', message: 'Please add a note when the reason is Other.' },
        }),
      ),
    )
    open()
    expect(screen.getByText('Please add a note when the reason is Other.')).toBeInTheDocument()
  })
})

// T1-11: the box promised "until reopened" while a lead closed from the pool was in no list at all.
describe('Close Lead — what it promises', () => {
  it('says where the lead can still be found', () => {
    open()
    expect(screen.getByText(/will leave your lead lists/)).toBeInTheDocument()
    expect(screen.getByText(/switching on “Include\s+closed” on the list/)).toBeInTheDocument()
    expect(screen.queryByText(/until reopened/)).not.toBeInTheDocument()
  })
})
