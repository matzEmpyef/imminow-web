export type DashboardScope = 'personal' | 'branch' | 'consultancy'

/**
 * Where each consultancy dashboard card opens, for the scope the viewer is looking at (phase 8,
 * T1-12). The rule is one sentence: the list a card opens shows exactly what the card counted, so
 * what the card says and what the viewer finds when they click it are the same people.
 *
 * What each card counts (`consultancy_dashboard.py`), and the list that shows the same rows:
 *
 *   unallocated_leads    open leads nobody holds, whole account, any scope  -> Lead Pool
 *   active_leads         open leads a consultant holds, in scope            -> Active Leads
 *   unattended           open leads whose last message is the student's,
 *                        assigned OR still in the pool, in scope            -> Active Leads, "Pending
 *                                                                              response", plus the pool
 *                                                                              unless Personal
 *   clients              cases the Clients list shows by default, in scope  -> Clients
 *   pending_allocation   those cases that have no consultant yet (whole
 *                        account scope only)                                -> Clients, "Unassigned"
 *
 * Personal scope counts only what the viewer holds, so those lists are narrowed to "mine". The
 * Branch and Whole scopes count more than the viewer's own, so the narrowing is dropped. A
 * Personal-scope unattended lead is always assigned (to the viewer), so the pool is not needed.
 * Whole scope counts the pool's unanswered students too, and Active Leads never lists the pool
 * unless it is asked to (`with_pool=true`).
 */
export function statLinkFor(key: string, scope: DashboardScope): string | undefined {
  const personal = scope === 'personal'
  switch (key) {
    case 'unallocated_leads':
      return '/sales/lead-pool'
    case 'active_leads':
      return personal ? '/sales/active-leads?assigned_to_me=true' : '/sales/active-leads'
    case 'unattended':
      if (personal) return '/sales/active-leads?unattended=true&assigned_to_me=true'
      return scope === 'consultancy'
        ? '/sales/active-leads?unattended=true&with_pool=true'
        : '/sales/active-leads?unattended=true'
    case 'clients':
      return personal ? '/clients?assigned_to_me=true' : '/clients'
    case 'converted':
      return '/clients'
    case 'pending_allocation':
      return '/clients?unassigned=true'
    default:
      return undefined
  }
}
