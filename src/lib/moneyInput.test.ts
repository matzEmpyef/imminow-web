import { describe, expect, it } from 'vitest'
import { MONEY_DECIMALS_ERROR, hasTooManyDecimals, moneyDecimalsError } from './moneyInput'

describe('hasTooManyDecimals', () => {
  it.each(['12', '12.', '12.3', '12.34', '12.340', '12.3400', '0.10', '1e3', '', '  ', 'abc', '-5.50'])(
    'accepts %j',
    (value) => expect(hasTooManyDecimals(value)).toBe(false),
  )

  it.each(['12.341', '0.001', '12.3401', '-5.505', '1e-3', '12.345e0'])('refuses %j', (value) =>
    expect(hasTooManyDecimals(value)).toBe(true),
  )

  it('reads numbers and empty values too', () => {
    expect(hasTooManyDecimals(12.34)).toBe(false)
    expect(hasTooManyDecimals(1.005)).toBe(true)
    expect(hasTooManyDecimals(null)).toBe(false)
    expect(hasTooManyDecimals(undefined)).toBe(false)
  })

  it('gives the server’s own sentence', () => {
    expect(MONEY_DECIMALS_ERROR).toBe('Amounts have at most two decimal places.')
    expect(moneyDecimalsError('1.234')).toBe(MONEY_DECIMALS_ERROR)
    expect(moneyDecimalsError('1.23')).toBeUndefined()
  })
})
