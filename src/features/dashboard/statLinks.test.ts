import { describe, expect, it } from 'vitest'
import { statLinkFor } from './statLinks'

// T1-12: the list a dashboard card opens shows the rows the card counted, in the scope shown.
describe('dashboard card links', () => {
  it.each([
    // key, personal, branch, whole consultancy
    ['unallocated_leads', '/sales/lead-pool', '/sales/lead-pool', '/sales/lead-pool'],
    [
      'active_leads',
      '/sales/active-leads?assigned_to_me=true',
      '/sales/active-leads',
      '/sales/active-leads',
    ],
    [
      'unattended',
      '/sales/active-leads?unattended=true&assigned_to_me=true',
      '/sales/active-leads?unattended=true',
      // The whole account also counts students still in the Lead Pool whose first message nobody answered.
      '/sales/active-leads?unattended=true&with_pool=true',
    ],
    ['clients', '/clients?assigned_to_me=true', '/clients', '/clients'],
    ['pending_allocation', '/clients?unassigned=true', '/clients?unassigned=true', '/clients?unassigned=true'],
  ])('%s', (key, personal, branch, consultancy) => {
    expect(statLinkFor(key, 'personal')).toBe(personal)
    expect(statLinkFor(key, 'branch')).toBe(branch)
    expect(statLinkFor(key, 'consultancy')).toBe(consultancy)
  })

  it('has no link for a card it does not know', () => {
    expect(statLinkFor('something_new', 'consultancy')).toBeUndefined()
  })
})
