import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { components } from '@/api/schema'
import { useCourseForm } from './useCourseForm'

type College = components['schemas']['College']
type Course = components['schemas']['Course']

const college: College = { id: 'college-1', name: 'Test College', campuses: [] }

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// A course whose only requirements content is the admin-invisible info_flags block — no
// academic/english/aptitude/moi/work-experience — the case `buildRequirements`'s own "nothing
// here" early return has to keep separate from an actually-empty requirements block.
const courseWithOnlyInfoFlags: Course = {
  id: 'course-1',
  name: 'BSc Computing',
  college_id: 'college-1',
  language: 'English',
  requirements: {
    info_flags: { interview_required: true, portfolio_required: false, min_age: 18 },
  },
}

// The requirements builder never had a UI for interview/portfolio/min-age, and the server
// replaces a course's whole `requirements` object on save — so a form that loads a course,
// leaves those flags alone, and saves after editing something unrelated used to send back
// `requirements` with no `info_flags` key at all (or `null` when nothing else was set), silently
// deleting flags admins had set through some other route. Fixed 2026-09-24: the form now carries
// the loaded value through untouched.
describe('useCourseForm requirements payload', () => {
  it('keeps info_flags in the payload after editing an unrelated field', () => {
    const { result } = renderHook(() => useCourseForm(college, courseWithOnlyInfoFlags), { wrapper })

    act(() => result.current.setDescription('Updated description'))

    const payload = result.current.toPayload()
    expect(payload.requirements).not.toBeNull()
    expect(payload.requirements?.info_flags).toEqual({
      interview_required: true,
      portfolio_required: false,
      min_age: 18,
    })
  })

  it('does not collapse a course with only info_flags to requirements: null', () => {
    const { result } = renderHook(() => useCourseForm(college, courseWithOnlyInfoFlags), { wrapper })

    expect(result.current.toPayload().requirements).not.toBeNull()
  })

  it('omits info_flags rather than inventing a default when the course never had one', () => {
    const courseWithoutInfoFlags: Course = {
      id: 'course-2',
      name: 'BA History',
      college_id: 'college-1',
      language: 'English',
    }
    const { result } = renderHook(() => useCourseForm(college, courseWithoutInfoFlags), { wrapper })

    // Nothing else on the requirements block is set either, so this exercises the true "nothing
    // here" path — it must still save as null, not as `{ info_flags: undefined, ... }`.
    expect(result.current.toPayload().requirements).toBeNull()
  })
})

// Nobody sets an intake's status since 2026-09-24 — the server derives it from the deadline — so
// the course save must not send one, and the form only ever shows the status the server derived
// for the date as saved.
describe('useCourseForm intake deadlines', () => {
  const courseWithIntakes: Course = {
    id: 'course-3',
    name: 'MSc Data Science',
    college_id: 'college-1',
    language: 'English',
    intakes: ['January', 'September'],
    intake_deadlines: [
      { month: 'January', application_deadline: '2027-03-31', status: 'open' },
      { month: 'September', application_deadline: null, status: 'unknown', rolled: false },
    ],
  }

  it('sends month and date only — no status — in the save payload', () => {
    const { result } = renderHook(() => useCourseForm(college, courseWithIntakes), { wrapper })

    act(() => result.current.onDeadlineChange('September', '2027-06-30'))

    expect(result.current.toPayload().intake_deadlines).toEqual([
      { month: 'January', application_deadline: '2027-03-31' },
      { month: 'September', application_deadline: '2027-06-30' },
    ])
  })

  it("shows the saved month's derived status until its date is edited", () => {
    const { result } = renderHook(() => useCourseForm(college, courseWithIntakes), { wrapper })

    expect(result.current.savedIntakeStatus('January')).toBe('open')
    expect(result.current.savedIntakeStatus('September')).toBe('unknown')
    expect(result.current.savedIntakeStatus('May')).toBeUndefined()

    act(() => result.current.onDeadlineChange('January', '2027-04-15'))
    expect(result.current.savedIntakeStatus('January')).toBeUndefined()

    // Typed back to the saved date, the saved status describes it again.
    act(() => result.current.onDeadlineChange('January', '2027-03-31'))
    expect(result.current.savedIntakeStatus('January')).toBe('open')
  })
})
