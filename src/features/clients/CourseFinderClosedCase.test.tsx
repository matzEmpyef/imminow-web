import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildCourseFinderColumns, type CourseFinderColumnsArgs } from './CourseFinderColumns'
import { CourseFinderNotesDrawer } from './CourseFinderNotesDrawer'
import type { components } from '@/api/schema'

// Course Finder writes into a person's chat in two ways: "Send this search" and Suggest. A closed
// case's chat is read-only (owner ruling 2026-10-06), so for one the page passes
// `canSuggest: false` and Suggest is not offered, in the results or in the notes drawer. Noting a
// course down is kept on this device and stays.
const course = { id: 'co1', name: 'MSc Data Science', college_name: 'Northfield University' } as components['schemas']['Course']

function actionsCell(overrides: Partial<CourseFinderColumnsArgs>) {
  const columns = buildCourseFinderColumns({
    canCheckFit: false,
    selectedPerson: { id: 'c1', kind: 'client' },
    shortlist: [],
    suggestedCourseIds: new Set(),
    suggestPending: false,
    suggestingId: undefined,
    onToggleShortlist: vi.fn(),
    onSuggest: vi.fn(),
    onOpenCourse: vi.fn(),
    onOpenCollege: vi.fn(),
    ...overrides,
  })
  render(<>{columns.find((c) => c.key === 'actions')!.render(course)}</>)
}

describe('Course Finder for a closed case', () => {
  it('offers Suggest on a live case', () => {
    actionsCell({})
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeInTheDocument()
  })

  it('offers no Suggest on a closed one, and still lets a course be noted down', () => {
    actionsCell({ canSuggest: false })
    expect(screen.queryByRole('button', { name: 'Suggest' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Note down MSc Data Science' })).toBeInTheDocument()
  })

  it('still shows what was already suggested', () => {
    actionsCell({ canSuggest: false, suggestedCourseIds: new Set(['co1']) })
    expect(screen.getByText('Suggested')).toBeInTheDocument()
  })

  it('offers no Suggest in the notes drawer either', () => {
    render(
      <CourseFinderNotesDrawer
        open
        onClose={vi.fn()}
        personLabel="Aiko Tanaka"
        shortlist={[{ course_id: 'co1', name: 'MSc Data Science' } as never]}
        suggestedCourseIds={new Set()}
        suggestPending={false}
        suggestingId={undefined}
        canSuggest={false}
        onSuggest={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText('MSc Data Science')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suggest' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove MSc Data Science from notes' })).toBeInTheDocument()
  })
})
