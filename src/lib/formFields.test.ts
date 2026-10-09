import { describe, expect, it } from 'vitest'
import { countFillableFields } from './formFields'

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
