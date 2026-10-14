import type { components } from '@/api/schema'

/**
 * Fields the server sends on a client's case and on a lead (Phase 8 T4-17, T4-23), read through one
 * function each so a screen asks for a plain sentence and gets text or null.
 */

function textOf(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/**
 * The note the consultancy typed when it closed a case (`Client.closing_note`) or a lead
 * (`Lead.closing_note`). Null while it is open, for older closures, and for anyone but staff.
 */
export function closingNoteOf(
  record: Pick<components['schemas']['Client'], 'closing_note'> | Pick<components['schemas']['Lead'], 'closing_note'> | null | undefined,
): string | null {
  return textOf(record?.closing_note)
}

/**
 * Why a live case cannot be transferred (`Client.transfer_blocked_reason`): the sentence to show in
 * plain view beside the switched-off transfer link. Null when a transfer may be tried.
 */
export function transferBlockedReasonOf(
  client: Pick<components['schemas']['Client'], 'transfer_blocked_reason'> | null | undefined,
): string | null {
  return textOf(client?.transfer_blocked_reason)
}

/**
 * Whether the answer to Reopen Case says nobody holds the case (`Client.needs_assigning`).
 * Undefined when the answer does not say.
 */
export function needsAssigningOf(answer: Pick<components['schemas']['Client'], 'needs_assigning'> | null | undefined): boolean | undefined {
  const value = answer?.needs_assigning
  return typeof value === 'boolean' ? value : undefined
}
