import { describe, expect, it } from 'vitest'
import { formatRate, inr, inrOrDash, rupeeSymbol } from './money'

describe('rupee figures (Phase 8 T1-04, T1-05)', () => {
  it('always shows exactly two decimals, with Indian grouping', () => {
    expect(inr(24354.88)).toBe('₹24,354.88')
    expect(inr(139343.75)).toBe('₹1,39,343.75')
    expect(inr(50000.5)).toBe('₹50,000.50')
    expect(inr(0)).toBe('₹0.00')
    expect(inrOrDash(50001)).toBe('₹50,001.00')
  })

  it('writes the minus sign before the symbol, never after it', () => {
    expect(inr(-0.12)).toBe('-₹0.12')
    expect(inrOrDash(-1234.5)).toBe('-₹1,234.50')
    expect(rupeeSymbol(-500)).toBe('-₹500.00')
  })

  it('does not show a minus on a figure that rounds to nothing', () => {
    expect(inr(-0.004)).toBe('₹0.00')
  })

  it('reads a missing figure as a dash or as zero, as before', () => {
    expect(inrOrDash(null)).toBe('—')
    expect(inr(undefined)).toBe('₹0.00')
  })
})

describe('formatRate', () => {
  it('shows at most six decimals and no trailing zeros', () => {
    expect(formatRate(61.5)).toBe('61.5')
    expect(formatRate(1.4000000000000001)).toBe('1.4')
    expect(formatRate(83.1234567891234)).toBe('83.123457')
    expect(formatRate(0.0123456789)).toBe('0.012346')
    expect(formatRate(1)).toBe('1')
  })

  it('shows a dash for no rate', () => {
    expect(formatRate(null)).toBe('—')
    expect(formatRate(undefined)).toBe('—')
  })
})
