/**
 * Fields the server now sends on a client's case and on a lead (Phase 8 T4-17, T4-23) that the
 * generated client does not carry yet. Each is read through ONE function here, so the cast lives in
 * one place; replace these with the generated types after the contract join.
 */

function textOf(record: object, key: string): string | null {
  // replace with generated type after the contract join
  const value = (record as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : null
}

/**
 * The note the consultancy typed when it closed a case (`Client.closing_note`) or a lead
 * (`Lead.closing_note`). Null while it is open, for older closures, and for anyone but staff.
 */
export function closingNoteOf(record: object | null | undefined): string | null {
  return record ? textOf(record, 'closing_note') : null
}

/**
 * Why a live case cannot be transferred (`Client.transfer_blocked_reason`): the sentence to show in
 * plain view beside the switched-off transfer link. Null when a transfer may be tried.
 */
export function transferBlockedReasonOf(client: object | null | undefined): string | null {
  return client ? textOf(client, 'transfer_blocked_reason') : null
}

/**
 * Whether the answer to Reopen Case says nobody holds the case (`needs_assigning`). Undefined when
 * the answer does not say.
 */
export function needsAssigningOf(answer: unknown): boolean | undefined {
  if (!answer || typeof answer !== 'object') return undefined
  // replace with generated type after the contract join
  const value = (answer as { needs_assigning?: unknown }).needs_assigning
  return typeof value === 'boolean' ? value : undefined
}
