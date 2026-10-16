import { describe, expect, it } from 'vitest'
import { examScoreError } from './examScores'

describe('examScoreError: a score is tied to its exam’s range', () => {
  const ielts = { name: 'IELTS', min_value: 0, max_value: 9 }

  it('accepts a score inside the range, including its ends', () => {
    expect(examScoreError('6.5', ielts)).toBeUndefined()
    expect(examScoreError('0', ielts)).toBeUndefined()
    expect(examScoreError('9', ielts)).toBeUndefined()
  })

  it('names the exam and its range for a score outside it', () => {
    expect(examScoreError('65', ielts)).toBe('Enter a score from 0 to 9 for IELTS.')
    expect(examScoreError('-1', ielts)).toBe('Enter a score from 0 to 9 for IELTS.')
  })

  it('handles an exam with only one end set', () => {
    expect(examScoreError('250', { name: 'GRE', min_value: 260 })).toBe('Enter a score of 260 or more for GRE.')
    expect(examScoreError('400', { name: 'GRE', max_value: 340 })).toBe('Enter a score of 340 or less for GRE.')
  })

  it('asks only for a number when the exam has no range, and leaves empty to the form', () => {
    expect(examScoreError('12345', { name: 'Other' })).toBeUndefined()
    expect(examScoreError('abc', undefined)).toBe('Enter a score as a number.')
    expect(examScoreError('', ielts)).toBeUndefined()
  })
})
