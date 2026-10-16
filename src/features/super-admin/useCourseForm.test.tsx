import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { components } from '@/api/schema'
import { courseFormBlocker, useCourseForm } from './useCourseForm'

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

// Owner's ruling 2026-10-10: money has at most two decimal places, in every currency.
describe('useCourseForm fee decimals', () => {
  // The rules before the fees (name, level, field, language, delivery) are met, so the fee rule is the one that speaks.
  function fillTheBasics(result: { current: ReturnType<typeof useCourseForm> }) {
    act(() => {
      result.current.setName('BSc Computing')
      result.current.setLevel('undergraduate')
      result.current.setFieldOfStudy('computing')
      result.current.setLanguage('English')
      result.current.setDelivery('on_campus')
    })
  }

  it('blocks the save on a third decimal in the tuition or application fee, and says so', () => {
    const { result } = renderHook(() => useCourseForm(college, courseWithOnlyInfoFlags), { wrapper })
    fillTheBasics(result)
    act(() => {
      result.current.setFeeAmount('12000.50')
      result.current.setFeeCurrency('CAD')
      result.current.setFeePeriod('per_year')
    })
    expect(courseFormBlocker(result.current)?.text ?? '').not.toMatch(/decimal/)

    act(() => result.current.setFeeAmount('12000.505'))
    expect(result.current.isValid).toBe(false)
    expect(courseFormBlocker(result.current)?.text).toBe('Amounts have at most two decimal places (Fees tab).')

    act(() => result.current.setFeeAmount('12000.500'))
    expect(courseFormBlocker(result.current)?.text ?? '').not.toMatch(/decimal/)
  })

  it('ignores the application fee while it is waived', () => {
    const { result } = renderHook(() => useCourseForm(college, courseWithOnlyInfoFlags), { wrapper })
    fillTheBasics(result)
    act(() => {
      result.current.setAppFeeAmount('50.123')
      result.current.onAppFeeCurrencyChange('CAD')
      result.current.setAppFeeWaived(true)
    })
    expect(courseFormBlocker(result.current)?.text ?? '').not.toMatch(/decimal/)
    act(() => result.current.setAppFeeWaived(false))
    expect(courseFormBlocker(result.current)?.text).toBe('Amounts have at most two decimal places (Fees tab).')
  })
})

// Decision 154: a score typed for an exam must sit inside the range the exam is set up with in
// Catalog Settings; the form will not save otherwise and names the range.
describe('useCourseForm score ranges', () => {
  const exams = [
    { id: 'ielts', name: 'IELTS', min_value: 0, max_value: 9 },
    { id: 'gre', name: 'GRE', min_value: 260, max_value: 340 },
  ] as components['schemas']['Exam'][]
  const course: Course = {
    id: 'course-2',
    name: 'MSc Data',
    college_id: 'college-1',
    language: 'English',
    level: 'masters',
    field_of_study: 'Computer Science',
    delivery: 'on_campus',
  } as Course

  it('has no range problem for a score inside the exam’s range', () => {
    const { result } = renderHook(() => useCourseForm(college, course, undefined, exams), { wrapper })
    act(() => result.current.onAddEnglish())
    act(() => result.current.onChangeEnglish(0, { exam_id: 'ielts', min_overall: '6.5', min_band: '6' }))
    expect(result.current.scoreRangeError).toBeUndefined()
  })

  it('names the range for an IELTS score of 65 and keeps the form from saving', () => {
    const { result } = renderHook(() => useCourseForm(college, course, undefined, exams), { wrapper })
    act(() => result.current.onAddEnglish())
    act(() => result.current.onChangeEnglish(0, { exam_id: 'ielts', min_overall: '65', min_band: '' }))
    expect(result.current.scoreRangeError).toBe('Enter a score from 0 to 9 for IELTS.')
    expect(result.current.isValid).toBe(false)
    expect(courseFormBlocker(result.current)?.text).toContain('Enter a score from 0 to 9 for IELTS.')
  })

  it('checks an entrance exam score the same way', () => {
    const { result } = renderHook(() => useCourseForm(college, course, undefined, exams), { wrapper })
    act(() => result.current.onAddAptitude())
    act(() => result.current.onChangeAptitude(0, { exam_id: 'gre', min_score: '310', required: 'required' }))
    expect(result.current.scoreRangeError).toBeUndefined()
    act(() => result.current.onChangeAptitude(0, { min_score: '3100' }))
    expect(result.current.scoreRangeError).toBe('Enter a score from 260 to 340 for GRE.')
  })
})
