import { describe, expect, it } from 'vitest'
import { stepStateColor, stepStateLabel } from './stepWords'

describe('stepStateLabel', () => {
  it('uses the ruled words, never the server codes', () => {
    expect(stepStateLabel({ status: 'locked' })).toBe('Pending')
    expect(stepStateLabel({ status: 'active' })).toBe('Active')
    expect(stepStateLabel({ status: 'active', submitted_at: '2026-10-01T10:00:00Z' })).toBe('Awaiting review')
    expect(stepStateLabel({ status: 'done' })).toBe('Completed')
  })

  it('colours a submitted step apart from a running one', () => {
    expect(stepStateColor({ status: 'active' })).toBe('info')
    expect(stepStateColor({ status: 'active', submitted_at: '2026-10-01T10:00:00Z' })).toBe('warning')
    expect(stepStateColor({ status: 'locked' })).toBe('secondary')
    expect(stepStateColor({ status: 'done' })).toBe('success')
  })
})
