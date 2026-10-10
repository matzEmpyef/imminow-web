import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner's ruling 2026-10-10: money has at most two decimal places. The reviewer's "Value to apply
// if modified" takes the same rule when the suggestion is for an amount (tuition fee, application
// fee), and shows the server's own sentence if it comes back. Any other field is untouched.
vi.mock('@/queries/moderation', () => ({
  useApproveCourseSuggestion: vi.fn(),
  useRejectCourseSuggestion: vi.fn(),
  useModerationQueue: vi.fn(),
}))
vi.mock('@/queries/studyLevels', () => ({ useStudyLevels: () => ({ data: [] }) }))
vi.mock('@/queries/adminColleges', () => ({ useAdminColleges: vi.fn(), useCollegeDetail: vi.fn() }))
vi.mock('./CollegeDetailPage', () => ({ CourseFormModal: () => null }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useApproveCourseSuggestion, useRejectCourseSuggestion } from '@/queries/moderation'
import { SuggestionDetailModal } from './CourseSuggestionsReviewPage'
import type { components } from '@/api/schema'

type CourseSuggestion = components['schemas']['CourseSuggestion']

const approveMutate = vi.fn()
const approveReset = vi.fn()

function mutation(mutate: ReturnType<typeof vi.fn>, error: Error | null = null) {
  return { mutate, reset: approveReset, isPending: false, isError: Boolean(error), error, variables: undefined } as never
}

function correction(field: string, label: string, suggested: string): CourseSuggestion {
  return {
    id: 's1',
    type: 'correction',
    kind: 'course_correction',
    status: 'pending',
    payload: { field, label, current: '20000', suggested },
    applicable_fields: [field],
    course: { id: 'course-1', college_id: 'col-1', name: 'MSc Data Science' },
    college_name: 'Northwind University',
    consultancy_name: 'Bright Path',
    created_at: '2026-10-01T09:00:00Z',
  } as unknown as CourseSuggestion
}

function renderModal(suggestion: CourseSuggestion) {
  render(
    <MemoryRouter>
      <SuggestionDetailModal suggestion={suggestion} onClose={() => {}} />
    </MemoryRouter>,
  )
}

const valueBox = () => screen.getByLabelText('Value to apply if modified')
const modify = () => screen.getByRole('button', { name: 'Add with modification' })

beforeEach(() => {
  approveMutate.mockClear()
  approveReset.mockClear()
  vi.mocked(useApproveCourseSuggestion).mockReturnValue(mutation(approveMutate))
  vi.mocked(useRejectCourseSuggestion).mockReturnValue(mutation(vi.fn()))
})

describe('the reviewer’s value for a money suggestion', () => {
  it.each([
    ['fee.amount', 'Tuition fee'],
    ['application_fee.amount', 'Application fee'],
  ])('refuses a third decimal on %s and keeps the button off', (field, label) => {
    renderModal(correction(field, label, '21000'))
    fireEvent.change(valueBox(), { target: { value: '21000.123' } })
    expect(valueBox()).toHaveAccessibleDescription('Amounts have at most two decimal places.')
    expect(modify()).toBeDisabled()
  })

  it('accepts two decimals and a trailing zero, and sends the value as typed', () => {
    renderModal(correction('fee.amount', 'Tuition fee', '21000'))
    fireEvent.change(valueBox(), { target: { value: '21000.50' } })
    expect(valueBox()).not.toHaveAttribute('aria-invalid', 'true')
    expect(modify()).toBeEnabled()
    fireEvent.click(modify())
    expect(approveMutate.mock.calls[0][0]).toEqual({ id: 's1', mode: 'modified', value: '21000.50' })
  })

  it('shows the server’s sentence for the value on the field, not as a general error', () => {
    vi.mocked(useApproveCourseSuggestion).mockReturnValue(
      mutation(
        approveMutate,
        new ApiError(
          'x',
          { error: { code: 'validation_failed', message: 'Check the form.', details: { fields: { value: 'Amounts have at most two decimal places.' } } } },
          400,
        ),
      ),
    )
    renderModal(correction('fee.amount', 'Tuition fee', '21000'))
    expect(valueBox()).toHaveAccessibleDescription('Amounts have at most two decimal places.')
    expect(screen.queryByText('Check the form.')).not.toBeInTheDocument()
  })

  it('leaves a field that is not money as free text, with no decimals rule', () => {
    renderModal(correction('duration', 'Duration', '2 years'))
    fireEvent.change(valueBox(), { target: { value: '1.234 years' } })
    expect(valueBox()).not.toHaveAccessibleDescription('Amounts have at most two decimal places.')
    expect(modify()).toBeEnabled()
  })
})
