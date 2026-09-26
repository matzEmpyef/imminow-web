import { describe, expect, it } from 'vitest'
import { fullJitterBackoffMs } from './backoff'

describe('fullJitterBackoffMs', () => {
  it('is a uniform draw between 0 and the exponential ceiling', () => {
    expect(fullJitterBackoffMs(0, () => 0)).toBe(0)
    expect(fullJitterBackoffMs(0, () => 0.999)).toBe(999) // ceiling 1000 * 0.999
    expect(fullJitterBackoffMs(1, () => 0.5)).toBe(1000) // ceiling 2000 * 0.5
    expect(fullJitterBackoffMs(2, () => 0.5)).toBe(2000) // ceiling 4000 * 0.5
  })

  it('caps the ceiling at 30s no matter how many attempts', () => {
    expect(fullJitterBackoffMs(10, () => 1)).toBeLessThanOrEqual(30000)
    expect(fullJitterBackoffMs(10, () => 0.999999)).toBeCloseTo(30000, -2)
  })

  it('never goes negative for a negative attempt count', () => {
    expect(fullJitterBackoffMs(-1, () => 1)).toBeLessThanOrEqual(1000)
  })
})
