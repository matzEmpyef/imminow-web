/**
 * Whether a consultancy or institute is on a free trial: a term with an end date and nothing
 * billed for it (no billing cycle, no amount). Read from what the server already sends (T4-37), so
 * the Subscription tab and the Manage Consultancies list say the same thing about the same account.
 */
export function isOnTrial(c: {
  subscription_expires_at?: string | null
  billing_cycle?: string | null
  subscription_amount?: number | null
}): boolean {
  return Boolean(c.subscription_expires_at) && !c.billing_cycle && !(c.subscription_amount && c.subscription_amount > 0)
}
