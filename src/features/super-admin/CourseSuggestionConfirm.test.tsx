import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-096: a correction's free text and links are copied into the course only for the fields
// the reviewer ticked "Use this text" on, each unticked to start with. And the "Suggest a
// correction" pencil is drawn only for staff holding the course-suggestions permission.
vi.mock('@/queries/moderation', () => ({
  useApproveCourseSuggestion: vi.fn(),
  useRejectCourseSuggestion: vi.fn(),
  useModerationQueue: vi.fn(),
}))
vi.mock('@/queries/studyLevels', () => ({ useStudyLevels: () => ({ data: [] }) }))
vi.mock('@/queries/adminColleges', () => ({ useAdminColleges: vi.fn(), useCollegeDetail: vi.fn() }))
vi.mock('@/queries/courseSuggestions', () => ({ useSuggestCorrection: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('./CollegeDetailPage', () => ({ CourseFormModal: () => null }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { useApproveCourseSuggestion, useRejectCourseSuggestion } from '@/queries/moderation'
import { useMe } from '@/queries/me'
import { meAnswered, staffMe } from '@/test/me'
import { SuggestCorrectionButton } from '@/features/clients/SuggestCorrectionButton'
import { SuggestionDetailModal } from './CourseSuggestionsReviewPage'
import type { components } from '@/api/schema'

type CourseSuggestion = components['schemas']['CourseSuggestion']

const approveMutate = vi.fn()

function mutation(mutate: ReturnType<typeof vi.fn>) {
  return { mutate, isPending: false, isError: false, error: null, variables: undefined } as never
}

function correction(payload: Record<string, unknown>, applicable: string[]): CourseSuggestion {
  return {
    id: 's1',
    type: 'correction',
    kind: 'course_correction',
    status: 'pending',
    payload,
    applicable_fields: applicable,
    course: { id: 'course-1', college_id: 'col-1', name: 'MSc Data Science', description: 'The current text.' },
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

beforeEach(() => {
  approveMutate.mockClear()
  vi.mocked(useApproveCourseSuggestion).mockReturnValue(mutation(approveMutate))
  vi.mocked(useRejectCourseSuggestion).mockReturnValue(mutation(vi.fn()))
})

describe('reviewing a correction that carries text or a link', () => {
  const suggestion = correction(
    { description: 'A new description.', course_url: 'https://example.edu/msc', duration_months: 18 },
    ['description', 'course_url', 'duration_months'],
  )

  it('gives each text or link field its own tick, unticked, and none to a plain fact', () => {
    renderModal(suggestion)
    expect(screen.getByRole('checkbox', { name: 'Use this text for Description' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Use this text for Course page' })).not.toBeChecked()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('sends only the ticked names with Add', () => {
    renderModal(suggestion)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use this text for Description' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(approveMutate.mock.calls[0][0]).toEqual({ id: 's1', mode: 'as_suggested', confirmedFields: ['description'] })
  })

  it('sends none when nothing is ticked: the plain fact is still applied', () => {
    renderModal(suggestion)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(approveMutate.mock.calls[0][0]).toEqual({ id: 's1', mode: 'as_suggested', confirmedFields: [] })
  })

  it('does not offer Add while every field it could write is unticked text', () => {
    renderModal(correction({ description: 'A new description.' }, ['description']))
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Use this text for Description' }))
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
  })

  it('shows no tick on a correction with nothing of the kind', () => {
    renderModal(correction({ field: 'fee.amount', label: 'Tuition fee', current: '20000', suggested: '21000' }, ['fee.amount']))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
  })
})

describe('the Suggest a correction pencil', () => {
  it('is drawn for staff who hold the course-suggestions permission', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ permissions: ['settings.manage_course_suggestions'] })))
    render(<SuggestCorrectionButton courseId="course-1" field="fee.amount" label="Tuition fee" current="20000" />)
    expect(screen.getByRole('button', { name: 'Suggest a correction for Tuition fee' })).toBeInTheDocument()
  })

  it('is not drawn without it, for a course or a college, filled or missing', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ permissions: ['clients.view_own'] })))
    render(
      <>
        <SuggestCorrectionButton courseId="course-1" field="fee.amount" label="Tuition fee" current="20000" />
        <SuggestCorrectionButton collegeId="col-1" field="website" label="Website" current={null} />
      </>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
