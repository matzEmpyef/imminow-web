import { useMemo, useState } from 'react'
import type { FollowupQueueFilters, FollowupSummary } from '@/queries/caseFollowups'

/**
 * The search and filters of a follow-up queue, as both queues hold them (review F-154). They are
 * sent to the server, which applies them over the whole queue and counts its `summary` over the
 * rows they keep; the page filters nothing itself. Any change starts the paging over, because a
 * cursor belongs to the list it was handed out for.
 */
export function useFollowupFilters(paging: { reset: () => void }) {
  const [state, setState] = useState<FollowupQueueFilters>({})

  function set(patch: FollowupQueueFilters) {
    const keys = Object.keys(patch) as (keyof FollowupQueueFilters)[]
    // The table reports its (debounced) search on mount too; nothing changed, nothing to restart.
    if (keys.every((key) => (state[key] || undefined) === (patch[key] || undefined))) return
    setState((current) => ({ ...current, ...patch }))
    paging.reset()
  }

  // Empty values are left out, so "nothing typed" and "never touched" are one request.
  const filters = useMemo<FollowupQueueFilters>(
    () => ({
      search: state.search?.trim() || undefined,
      signal: state.signal || undefined,
      consultancyId: state.consultancyId || undefined,
      notCalled: state.notCalled || undefined,
      dueForCall: state.dueForCall || undefined,
      includeSnoozed: state.includeSnoozed || undefined,
    }),
    [state],
  )

  /** Something other than "Show snoozed" narrows the list: an empty answer is then "no match". */
  const narrowed = Boolean(
    filters.search || filters.signal || filters.consultancyId || filters.notCalled || filters.dueForCall,
  )

  return { filters, set, narrowed }
}

/**
 * The Signal filter's options: every signal the queue has, by its label. The count beside one is
 * the server's, over the rows the search and the other filters keep. It is left out while a
 * signal is chosen: the summary then covers that signal's rows only, and a count beside another
 * signal would be how often the two occur together, not how many rows choosing it would show.
 */
export function signalOptions(
  labels: Record<string, string>,
  summary: FollowupSummary | undefined,
  chosen: string | undefined,
): { code: string; label: string }[] {
  const counts = summary?.by_signal ?? {}
  const codes = [...new Set([...Object.keys(labels), ...Object.keys(counts)])]
  return codes.map((code) => {
    const label = labels[code] ?? code
    return { code, label: chosen || counts[code] == null ? label : `${label} (${counts[code]})` }
  })
}
