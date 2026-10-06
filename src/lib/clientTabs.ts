/**
 * The tabs of a client's profile, and the ONE way to build a link to one of them (review F-164).
 *
 * The profile page reads these names from the address (`?tab=Applications`), and other screens
 * link straight to a tab. Those links were written out by hand as text. When "Selected Colleges"
 * was renamed "Applications", the Activity queue's offer and deadline rows kept the old name; the
 * profile page did not recognise it and quietly opened Overview instead of the application the
 * consultant had clicked.
 *
 * With the names here and `clientTabPath` the only way to make such a link, a tab that is renamed
 * or removed no longer compiles until every link to it is updated.
 */
export const CLIENT_TABS = [
  'Overview',
  'Plan',
  'Forms',
  'Commissions',
  'Applications',
  'Documents',
  'Internal Notes',
  'Activity',
] as const

export type ClientTab = (typeof CLIENT_TABS)[number]

/** Whether `value` (the address's `tab`) names a tab the profile has. */
export function isClientTab(value: string | null | undefined): value is ClientTab {
  return (CLIENT_TABS as readonly string[]).includes(value ?? '')
}

/**
 * The address of a client's profile, on `tab`. `step` opens the Plan tab on that step; `plan` on
 * that plan. Overview is the page's default and adds nothing to the address.
 */
export function clientTabPath(
  clientId: string,
  tab: ClientTab = 'Overview',
  options: { step?: string; plan?: string } = {},
): string {
  const params = new URLSearchParams()
  if (tab !== 'Overview') params.set('tab', tab)
  if (options.step) params.set('step', options.step)
  if (options.plan) params.set('plan', options.plan)
  const query = params.toString()
  return `/clients/${clientId}${query ? `?${query}` : ''}`
}
