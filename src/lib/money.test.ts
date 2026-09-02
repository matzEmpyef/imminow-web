import { describe, expect, it } from 'vitest'
import { formatAmountOnly, formatCourseFee, formatMoney, formatMoneyAmount } from './money'

// The one live bug this module was extracted to fix (audit, 2026-09-01): the same INR amount
// rendered with western grouping on one page and Indian grouping on another. These pin the rule
// so a future "simplification" to a single toLocaleString() cannot quietly bring it back.
describe('formatMoney', () => {
  it('groups INR the Indian way (lakh/crore), matching the mobile app', () => {
    expect(formatMoney('INR', 3500000)).toBe('INR 35,00,000')
    expect(formatMoney('INR', 12000)).toBe('INR 12,000')
    expect(formatMoney('INR', 123456789)).toBe('INR 12,34,56,789')
  })

  it('groups every other currency the western way', () => {
    expect(formatMoney('CAD', 3500000)).toBe('CAD 3,500,000')
    expect(formatMoney('USD', 999)).toBe('USD 999')
  })

  it('renders a dash for a missing amount and omits the code when there is none', () => {
    expect(formatMoney('INR', null)).toBe('—')
    expect(formatMoney('INR', undefined)).toBe('—')
    expect(formatMoney(null, 1500)).toBe('1,500')
  })

  it('formats zero as a real amount, not as missing', () => {
    expect(formatMoney('INR', 0)).toBe('INR 0')
  })
})

describe('formatAmountOnly', () => {
  it('applies the same grouping rule without the currency prefix', () => {
    expect(formatAmountOnly('INR', 3500000)).toBe('35,00,000')
    expect(formatAmountOnly('GBP', 3500000)).toBe('3,500,000')
    expect(formatAmountOnly('INR', null)).toBe('—')
  })
})

describe('formatMoneyAmount / formatCourseFee', () => {
  it('reads the { amount, currency } shape the API returns', () => {
    expect(formatMoneyAmount({ amount: 250000, currency: 'INR' })).toBe('INR 2,50,000')
    expect(formatMoneyAmount(null)).toBe('—')
    expect(formatMoneyAmount({ amount: null, currency: 'INR' })).toBe('—')
  })

  it('appends /yr only for per_year fees', () => {
    expect(formatCourseFee({ amount: 32000, currency: 'CAD' }, 'per_year')).toBe('CAD 32,000/yr')
    expect(formatCourseFee({ amount: 32000, currency: 'CAD' }, 'total')).toBe('CAD 32,000')
    expect(formatCourseFee({ amount: 32000, currency: 'CAD' })).toBe('CAD 32,000')
    expect(formatCourseFee({ amount: null, currency: 'CAD' }, 'per_year')).toBe('—')
  })
})
