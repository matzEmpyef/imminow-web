import type { components } from '../api/schema'

/**
 * What a broadcast is about, derived from the generated schema so it cannot drift from the contract.
 *
 * Closed on 2026-08-27 (it was a free-text box). The value is purely a label on the send history —
 * badge in the table, included in that table's search — so free text undermined the single thing it
 * exists for: "Newsletter", "newsletter" and "News letter" filed and filtered as three separate
 * categories in the history you are meant to be organising.
 *
 * It does NOT affect delivery. Recipients come from `audience` plus `targeting`, and channel routing
 * uses a fixed `broadcast` notification category, never this value.
 */
export type BroadcastCategory = NonNullable<components['schemas']['BroadcastInput']['category']>

export const BROADCAST_CATEGORIES: BroadcastCategory[] = [
  'content',
  'feature',
  'event',
  'promotion',
  'platform',
  'policy',
  'reminder',
]

/** Display text plus the "when would I pick this?" hint, since the slugs alone are ambiguous. */
export const BROADCAST_CATEGORY_LABELS: Record<BroadcastCategory, string> = {
  content: 'Content — a new article, guide or resource',
  feature: 'Feature — something new in the app or console',
  event: 'Event — a webinar, quiz or meetup',
  promotion: 'Promotion — an offer, coupon or points campaign',
  platform: 'Platform — maintenance, downtime or a release',
  policy: 'Policy — terms, privacy or compliance changes',
  reminder: 'Reminder — a nudge or an approaching deadline',
}

/** Short form for the history table's badge, where the full hint would not fit. */
export const BROADCAST_CATEGORY_SHORT: Record<BroadcastCategory, string> = {
  content: 'Content',
  feature: 'Feature',
  event: 'Event',
  promotion: 'Promotion',
  platform: 'Platform',
  policy: 'Policy',
  reminder: 'Reminder',
}

export const broadcastCategoryLabel = (value: string) => BROADCAST_CATEGORY_SHORT[value as BroadcastCategory] ?? value
