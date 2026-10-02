import { describe, expect, it } from 'vitest'
import { creditsByCurrency } from './money'

// Contract gate 11, F10: `credit` per currency is confirmed money beyond what any due part still
// owes. Absent on the frozen mock, so "no credit" must read as an empty list, never as zeros.
describe('creditsByCurrency', () => {
  it('keeps only currencies holding a positive credit', () => {
    expect(
      creditsByCurrency([
        { currency: 'INR', credit: 0 },
        { currency: 'CAD', credit: 500 },
        { currency: 'GBP', credit: null },
        { currency: 'AUD' },
      ]),
    ).toEqual([{ currency: 'CAD', credit: 500 }])
  })

  it('is empty for a missing list', () => {
    expect(creditsByCurrency(undefined)).toEqual([])
    expect(creditsByCurrency(null)).toEqual([])
  })
})
