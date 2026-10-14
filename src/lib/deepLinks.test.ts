import { describe, expect, it } from 'vitest'
import { isAllowedDeepLink, notificationLink, safeDeepLink } from './deepLinks'

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

// `staff_invite_lapsed` (owner's ruling 2026-10-09): "An invitation is no longer valid" opens the team page.
describe('the lost-invite notice', () => {
  it('lets through the team page', () => {
    expect(isAllowedDeepLink('/administration/employees')).toBe(true)
  })
})

// `admin_role_handed_over` (owner, DECISIONS 122(a)): the new and the former administrator are both
// sent to the staff page, which is on the allowed list.
describe('the administrator notice', () => {
  it('opens the staff page, not the fallback', () => {
    expect(safeDeepLink('/administration/employees', '/notifications')).toBe('/administration/employees')
  })
})

// T1-07: a case notice arrives as `/clients/{journey_id}`, filled in by the server.
describe('the case notices', () => {
  it('opens a client by its id', () => {
    expect(isAllowedDeepLink('/clients/0192f3a4-7b6c-7d00-9a11-3f5e8c2b1d44')).toBe(true)
    expect(safeDeepLink('/clients/0192f3a4-7b6c-7d00-9a11-3f5e8c2b1d44', '/notifications')).toBe(
      '/clients/0192f3a4-7b6c-7d00-9a11-3f5e8c2b1d44',
    )
  })

  it('does not follow a link the server left as a template', () => {
    expect(isAllowedDeepLink('/clients/{client_id}')).toBe(false)
    expect(isAllowedDeepLink('/clients/{journey_id}')).toBe(false)
    expect(safeDeepLink('/clients/{client_id}', '/notifications')).toBe('/notifications')
  })
})

// Phase 8 bell notices: where each opens.
describe('notificationLink', () => {
  it('opens the dispute queue for a dispute notice, whichever path the server writes', () => {
    expect(notificationLink({ type: 'case_dispute_open_3_days', deep_link: '/admin/support/disputes' }, '/n')).toBe('/admin/disputes')
    expect(isAllowedDeepLink('/admin/support/disputes')).toBe(true)
  })

  it('opens the client’s plan for a step waiting for review', () => {
    for (const type of ['step_review_waiting', 'step_review_unanswered']) {
      expect(notificationLink({ type, deep_link: '/clients/j1' }, '/n')).toBe('/clients/j1?tab=Plan')
    }
  })

  it('opens the client for a student who has committed', () => {
    expect(notificationLink({ type: 'client_committed', deep_link: '/clients/j1' }, '/n')).toBe('/clients/j1')
  })

  it('opens the subscription for a plan downgrade', () => {
    expect(notificationLink({ type: 'plan_downgraded', deep_link: '/administration/consultancy-profile' }, '/n')).toBe(
      '/administration/consultancy-profile?tab=subscription',
    )
  })

  it('falls back when the link is not one this console serves', () => {
    expect(notificationLink({ type: 'step_review_waiting', deep_link: '/clients/{journey_id}' }, '/n')).toBe('/n')
    expect(notificationLink({ type: 'x', deep_link: null })).toBeNull()
  })
})
