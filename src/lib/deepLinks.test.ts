import { describe, expect, it } from 'vitest'
import { isAllowedDeepLink } from './deepLinks'

// The notices about a lead nobody answered or nobody was given (owner's ruling 2026-10-09):
// `new_lead` and `lead_reply_overdue` open the lead's page, `lead_unanswered` the service
// follow-up queue, and staff are also sent to the Lead Pool.
describe('the lead notices', () => {
  it('lets through the Lead Pool, the lead page and the follow-up queue', () => {
    expect(isAllowedDeepLink('/sales/lead-pool')).toBe(true)
    expect(isAllowedDeepLink('/sales/active-leads/lead-1')).toBe(true)
    expect(isAllowedDeepLink('/admin/student-followups')).toBe(true)
  })

  it('still refuses a bare prefix and anything that leaves the console', () => {
    expect(isAllowedDeepLink('/sales/active-leads/')).toBe(false)
    expect(isAllowedDeepLink('//evil.example/sales/active-leads/1')).toBe(false)
    expect(isAllowedDeepLink('/sales/lead-pool/../../x')).toBe(false)
  })
})
