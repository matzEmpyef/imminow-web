import { describe, expect, it } from 'vitest'
import { countFillableFields, withoutBlankTableRows } from './formFields'

describe('countFillableFields', () => {
  it('counts group members and loose fields, a table once, and never a group itself', () => {
    const text = { type: 'text' as const }
    expect(
      countFillableFields([
        { type: 'group', fields: [text, text, { type: 'table' }] },
        { type: 'group', fields: [] },
        { type: 'group' },
        text,
        { type: 'table' },
      ]),
    ).toBe(5)
    expect(countFillableFields([])).toBe(0)
    expect(countFillableFields(undefined)).toBe(0)
  })
})

describe('withoutBlankTableRows (review 2.63)', () => {
  const fields = [
    { id: 'name', type: 'text' },
    { id: 'edu', type: 'table' },
    { id: 'grp', type: 'group', fields: [{ id: 'jobs', type: 'table' }] },
  ]

  it('leaves out rows with nothing answered, in tables inside groups too, and keeps the order', () => {
    const answers = {
      name: '',
      edu: [{ a: 'x' }, {}, { a: ' ', b: '', c: [] }, null, { a: false }],
      jobs: [{ role: '' }, { role: 'Nurse' }],
    }
    expect(withoutBlankTableRows(fields, answers)).toEqual({
      name: '',
      edu: [{ a: 'x' }, { a: false }],
      jobs: [{ role: 'Nurse' }],
    })
  })

  it('does not change the answers it was given, and ignores a table with no list', () => {
    const answers = { edu: [{}] }
    withoutBlankTableRows(fields, answers)
    expect(answers).toEqual({ edu: [{}] })
    expect(withoutBlankTableRows(fields, { edu: 'oops' })).toEqual({ edu: 'oops' })
  })
})
