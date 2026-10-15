import { describe, expect, it } from 'vitest'
import { convertedLeadOf, repeatWarningOf } from './servedCaseFields'
import { responseTimeTextOf } from './servedTier4Fields'

// The Tier 4 fields the generated types do not carry yet, each read through one function.
describe('convertedLeadOf', () => {
  it('reads the served client and notice', () => {
    expect(convertedLeadOf({ status: 'converted', converted_client_id: 'c1', converted_notice: 'Now a client.' })).toEqual({
      clientId: 'c1',
      notice: 'Now a client.',
    })
  })
  it('falls back to the status alone, and to the client alone', () => {
    expect(convertedLeadOf({ status: 'converted' })).toEqual({ clientId: null, notice: null })
    expect(convertedLeadOf({ status: 'active', converted_client_id: 'c1' })).toEqual({ clientId: 'c1', notice: null })
  })
  it('is null for any other lead', () => {
    expect(convertedLeadOf({ status: 'active' })).toBeNull()
    expect(convertedLeadOf({ status: 'closed', converted_client_id: '' })).toBeNull()
    expect(convertedLeadOf(undefined)).toBeNull()
  })
})

describe('repeatWarningOf', () => {
  it('reads the warning, and nothing when there is none', () => {
    expect(repeatWarningOf({ warning: 'May be a repeat.' })).toBe('May be a repeat.')
    expect(repeatWarningOf({})).toBeNull()
    expect(repeatWarningOf({ warning: ' ' })).toBeNull()
    expect(repeatWarningOf(undefined)).toBeNull()
  })
})

describe('responseTimeTextOf', () => {
  it('prefers the served text, then the console’s own wording, then nothing', () => {
    expect(responseTimeTextOf({ response_time_median_hours: 2862, response_time_median_text: '119 days 6 hours' })).toBe(
      '119 days 6 hours',
    )
    expect(responseTimeTextOf({ response_time_median_hours: 2862 })).toBe('119 days 6 hours')
    expect(responseTimeTextOf({ response_time_median_hours: 30 })).toBe('30 hours')
    expect(responseTimeTextOf({ response_time_median_hours: null })).toBeNull()
    expect(responseTimeTextOf(undefined)).toBeNull()
  })
})
