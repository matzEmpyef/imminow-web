import type { components } from '@/api/schema'

type Conversation = components['schemas']['Conversation']

// The client-side fallback when a row carries no explicit badge — "Lead" for a lead,
// "Applicant" for a client, "Colleague" for an internal DM without an Admin badge. Shared by the
// Global Chat drawer and the floating chat window (Phase 5 cleanup, 2026-09-24).
export const CHAT_TYPE_LABELS: Record<Conversation['type'], string> = {
  lead: 'Lead',
  client: 'Applicant',
  internal: 'Colleague',
}
