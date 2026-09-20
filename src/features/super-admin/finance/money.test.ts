import { describe, expect, it } from 'vitest'
import { paymentAmount, paymentInrNote, paymentMoney } from './money'

// Assumptions audit M15 (product owner, 2026-09-19). Two separate defects, both invisible on
// screen because the numbers looked exact: a received amount rounded to whole units, and a
// cross-currency settlement re-converted at today's rate on every read.
describe('paymentAmount', () => {
  it('reads minor units, so the paise are not lost', () => {
    expect(paymentAmount({ amount: { amount: 1241, currency: 'CAD' }, amount_minor: 124060, currency_exponent: 2 })).toBe(
      1240.6,
    )
  })

  it('honours a currency with no minor unit at all', () => {
    expect(paymentAmount({ amount: { amount: 5000, currency: 'JPY' }, amount_minor: 5000, currency_exponent: 0 })).toBe(5000)
  })

  it('honours a three-decimal currency', () => {
    expect(paymentAmount({ amount: { amount: 12, currency: 'KWD' }, amount_minor: 12500, currency_exponent: 3 })).toBe(12.5)
  })

  it('falls back to the major-unit figure on a row written before minor units were stored', () => {
    expect(paymentAmount({ amount: { amount: 1241, currency: 'CAD' } })).toBe(1241)
  })

  it('is undefined when there is no amount at all', () => {
    expect(paymentAmount(undefined)).toBeUndefined()
    expect(paymentAmount({ amount: { amount: null, currency: 'CAD' } })).toBeUndefined()
  })
})

describe('paymentMoney', () => {
  it('formats INR with the symbol and Indian grouping', () => {
    expect(paymentMoney({ amount: { amount: 0, currency: 'INR' }, amount_minor: 350000000, currency_exponent: 2 })).toBe(
      '₹35,00,000',
    )
  })

  it('renders a dash rather than a zero for a missing amount', () => {
    expect(paymentMoney({ amount: { amount: null, currency: 'CAD' } })).toBe('—')
  })
})

describe('paymentInrNote', () => {
  it('shows the rate the settlement was valued at, and when that rate was set', () => {
    expect(
      paymentInrNote({
        amount: { amount: 1240.6, currency: 'CAD' },
        amount_inr: 103218,
        rate_used: 83.2,
        rate_as_of: '2026-09-12T10:00:00Z',
      }),
    ).toBe('≈ ₹1,03,218 at 83.2, rate of 12 Sep')
  })

  it('shows the ≈ figure alone on a row written before the rate was stored, never inventing one', () => {
    expect(paymentInrNote({ amount: { amount: 1240, currency: 'CAD' }, amount_inr: 103168 })).toBe('≈ ₹1,03,168')
  })

  it('says nothing for an INR payment — there is nothing to convert', () => {
    expect(paymentInrNote({ amount: { amount: 5000, currency: 'INR' }, amount_inr: 5000, rate_used: 1 })).toBeNull()
  })

  it('says nothing when the rupee value is not known', () => {
    expect(paymentInrNote({ amount: { amount: 1240, currency: 'CAD' } })).toBeNull()
    expect(paymentInrNote(null)).toBeNull()
  })
})
