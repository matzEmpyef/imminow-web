import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The product owner's 2026-09-24 decision: nobody sets an intake's status — the server derives it
// from the deadline. So this editor sets a DATE only: no Status control, no `status` in the PATCH,
// and what it hands back to Course Detail is the server's entry (derived status included), never a
// status worked out here.
vi.mock('@/queries/courseSuggestions', () => ({ useSetIntakeDeadline: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useSetIntakeDeadline } from '@/queries/courseSuggestions'
import { IntakeDeadlineEditor } from './IntakeDeadlineEditor'
import { ROLLED_DEADLINE_NOTE } from '@/features/super-admin/courseFormShared'

const mockedSetDeadline = vi.mocked(useSetIntakeDeadline)
const mutate = vi.fn()

beforeEach(() => {
  mutate.mockReset()
  mockedSetDeadline.mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never)
})

function openEditor(props: Partial<Parameters<typeof IntakeDeadlineEditor>[0]> = {}) {
  const onApplied = vi.fn()
  render(
    <IntakeDeadlineEditor
      courseId="course-1"
      month="January"
      currentDeadline="2027-03-31"
      onApplied={onApplied}
      {...props}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Set the January application deadline' }))
  return onApplied
}

describe('IntakeDeadlineEditor', () => {
  it('has a date field and no status control', () => {
    openEditor()

    expect(screen.getByLabelText('Application deadline')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument()
  })

  it('sends month and date only', () => {
    openEditor()

    fireEvent.change(screen.getByLabelText('Application deadline'), { target: { value: '2027-04-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0]).toEqual({ month: 'January', application_deadline: '2027-04-15' })
  })

  it("hands back the server's entry for the month, derived status and cleared rolled flag included", () => {
    const onApplied = openEditor({ rolled: true })
    expect(screen.getByText(ROLLED_DEADLINE_NOTE)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const saved = { month: 'January', application_deadline: '2027-03-31', status: 'open' as const, rolled: false }
    mutate.mock.calls[0][1].onSuccess({ applied: true, course: { intake_deadlines: [saved] } })

    expect(onApplied).toHaveBeenCalledWith(saved)
  })

  it('hands back the date alone, with no status, when the response carries no course', () => {
    const onApplied = openEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    mutate.mock.calls[0][1].onSuccess({ applied: true })

    expect(onApplied).toHaveBeenCalledWith({ month: 'January', application_deadline: '2027-03-31' })
  })
})
