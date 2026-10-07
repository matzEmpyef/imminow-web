/**
 * A channel-B client is the consultancy's own (Create Applicant). Their entry is a bookkeeping
 * record kept for the consultancy's own books — no Sentpo share, no dues, nothing owed, never
 * visible to Sentpo (gate 12b, owner Q5). The entry's own `channel` wins once it exists; before
 * that the client's `acquisition_source` says. Both fields are absent on the frozen mock, which
 * keeps today's behaviour.
 */
export const BOOKKEEPING_CAPTION =
  'This is your own record for this client — it is not shared with immiNow, and nothing here is owed to immiNow.'

export function isBookkeepingChannel(entryChannel?: string | null, clientSource?: string | null): boolean {
  return (entryChannel ?? clientSource) === 'B'
}
