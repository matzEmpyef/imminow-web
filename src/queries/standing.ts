import type { QueryClient } from '@tanstack/react-query'

/**
 * What else changes on screen when a lead or a case changes hands or standing — it is assigned,
 * moved to another branch, closed, reopened or transferred (review F-156, the part approved for
 * now: screens that failed to refresh when they should).
 *
 * Those saves refreshed the lead or client lists and nothing else, so for up to half a minute:
 *
 *   - the dashboard still counted the lead or case where it had been;
 *   - the chat drawer still listed (or still hid) the conversation — who is assigned decides who
 *     sees a thread, and a closed case leaves the list;
 *   - the Activity queue still showed its steps, offers and deadlines.
 *
 * One function, so every such save refreshes the same three and a new one cannot forget any.
 * Only screens that are open are read again; the rest are marked stale for their next visit.
 */
export function refreshStanding(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  void queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
}
