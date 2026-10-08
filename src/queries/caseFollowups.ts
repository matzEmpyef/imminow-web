import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type CaseFollowupRow = components['schemas']['CaseFollowupRow']
export type FollowupSummary = components['schemas']['FollowupSummary']
export type FollowupNote = components['schemas']['FollowupNote']

/** Finance's own outcome codes for a logged call (mock-server FOLLOWUP_OUTCOMES.finance). */
export type CaseFollowupOutcome = 'promised_to_close' | 'disputed' | 'no_answer' | 'resolved'

/**
 * What a follow-up queue is narrowed by. All of it is applied by the SERVER over the whole queue
 * (review F-154), and the queue's `summary` is counted over exactly the rows it keeps, so the
 * tiles, the list and the paging always describe the same rows.
 */
export interface FollowupQueueFilters {
  search?: string
  /** One signal code of the queue. */
  signal?: string
  /** Payment follow-ups only. */
  consultancyId?: string
  notCalled?: boolean
  dueForCall?: boolean
  includeSnoozed?: boolean
}

/** The `filter[...]` half of a follow-up queue request; undefined when nothing narrows it. */
export function followupFilterParam(filters: FollowupQueueFilters): Record<string, string> | undefined {
  const filter: Record<string, string> = {}
  if (filters.signal) filter.signal = filters.signal
  if (filters.consultancyId) filter.consultancy_id = filters.consultancyId
  if (filters.notCalled) filter.not_called = 'true'
  if (filters.dueForCall) filter.due_for_call = 'true'
  return Object.keys(filter).length > 0 ? filter : undefined
}

/**
 * Cases the payments team should chase.
 *
 * Closing a case is a consultancy action, and closing is what makes the commission due — so a
 * consultancy controls when it owes the platform money. This is how the platform notices when
 * that has not happened. Nothing here closes or moves anything: working the queue is a phone
 * call, not a button.
 */
export function useCaseFollowups(filters: FollowupQueueFilters = {}, cursor?: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    // Cursor-paged (contract gate 12; the frozen mock ignores `cursor` and returns every row with
    // no `meta`). `summary` rides every page; keep the previous page on screen while the next
    // loads. The filters are part of the key, so an answer to an earlier search can never be
    // shown for a later one, and its request is aborted through the `signal`.
    queryKey: ['case-followups', 'list', filters, cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/case-followups', {
        signal,
        params: {
          query: {
            include_snoozed: filters.includeSnoozed ?? false,
            cursor,
            search: filters.search?.trim() || undefined,
            filter: followupFilterParam(filters),
          },
        },
      })
      if (error) throw new ApiError('Could not load the follow-up queue.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/** Every note left on one case, newest first. */
export function useCaseNotes(journeyId: string | null) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['case-followups', 'notes', journeyId],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/clients/{id}/followups', {
        signal,
        params: { path: { id: journeyId! } },
      })
      if (error) throw new ApiError('Could not load the call history.', error)
      return data.items
    },
    enabled: isAuthed && Boolean(journeyId),
  })
}

/** Record that someone called. No status, no assignment — it exists so the next person knows. */
export function useRecordFollowup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      journeyId,
      note,
      outcome,
      callBackOn,
    }: {
      journeyId: string
      note: string
      outcome?: CaseFollowupOutcome
      callBackOn?: string
    }) => {
      const { data, error } = await api.POST('/clients/{id}/followups', {
        params: { path: { id: journeyId } },
        body: { note, outcome, call_back_on: callBackOn },
      })
      if (error) throw new ApiError('Could not save this note.', error)
      return data
    },
    // Broad prefix match — invalidates both the queue list (any includeSnoozed variant) and this
    // case's own notes query, since a saved call changes what both show.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case-followups'] }),
  })
}
