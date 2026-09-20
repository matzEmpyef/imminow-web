import { describe, expect, it } from 'vitest'
import { INTAKE_GROUPS, intakeGroupOf, intakeLabelFor, intakeMonthName, intakeYearOptions } from './intake'

// Assumptions audit M9 (product owner, 2026-09-19): the `first_half` / `second_half` calendar
// halves are gone. A September start used to be filed as "second half" and therefore measured
// from 1 July — three months early, on the clock the "intake set, no consultancy yet" queue
// counts days against.
describe('intake groups', () => {
  it('splits the admissions year Aug–Dec and Jan–Jul, in that order', () => {
    expect(INTAKE_GROUPS.map((g) => g.code)).toEqual(['aug_dec', 'jan_jul'])
    expect(INTAKE_GROUPS.flatMap((g) => g.months).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ])
  })

  it('puts July with January and August with December — not with the calendar half', () => {
    expect(intakeGroupOf(7)?.code).toBe('jan_jul')
    expect(intakeGroupOf(8)?.code).toBe('aug_dec')
  })

  it('anchors a whole-group pick on the group’s first month', () => {
    expect(INTAKE_GROUPS.find((g) => g.code === 'aug_dec')?.anchor).toBe(8)
    expect(INTAKE_GROUPS.find((g) => g.code === 'jan_jul')?.anchor).toBe(1)
  })

  it('has no month outside 1–12', () => {
    expect(intakeGroupOf(0)).toBeUndefined()
    expect(intakeGroupOf(13)).toBeUndefined()
    expect(intakeGroupOf(null)).toBeUndefined()
  })
})

describe('intakeLabelFor', () => {
  it('words one month and its year', () => {
    expect(intakeLabelFor({ month: 9, year: 2027, any_in_group: false })).toBe('September 2027')
  })

  it('words a whole-group pick by the months it spans, never as "Fall" or "Spring"', () => {
    const label = intakeLabelFor({ month: 8, year: 2027, any_in_group: true })
    expect(label).toBe('Any month August–December 2027')
    expect(label).not.toMatch(/fall|spring/i)
  })

  it('shows the month alone when no year has been committed to', () => {
    expect(intakeLabelFor({ month: 1, year: null, any_in_group: false })).toBe('January')
  })

  it('shows the year alone when only a year is known', () => {
    expect(intakeLabelFor({ month: null, year: 2028, any_in_group: false })).toBe('2028')
  })

  it('is empty for nothing at all', () => {
    expect(intakeLabelFor(null)).toBe('')
    expect(intakeLabelFor({ month: null, year: null, any_in_group: false })).toBe('')
  })
})

describe('intakeMonthName', () => {
  it('matches the month names a course’s own `intakes` list stores', () => {
    expect(intakeMonthName(1)).toBe('January')
    expect(intakeMonthName(12)).toBe('December')
    expect(intakeMonthName(null)).toBe('')
  })
})

describe('intakeYearOptions', () => {
  // The contract bounds `Intake.year` to this year through this year + 10 — a student may plan
  // several intakes ahead, but 1850 is a typo, not a plan.
  it('runs from this year through this year + 10', () => {
    const years = intakeYearOptions(new Date('2026-09-20T00:00:00'))
    expect(years[0]).toBe(2026)
    expect(years.at(-1)).toBe(2036)
    expect(years).toHaveLength(11)
  })
})
