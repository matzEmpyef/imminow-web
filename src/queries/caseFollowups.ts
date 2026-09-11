import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
 * Cases the payments team should chase.
 *
 * Closing a case is a consultancy action, and closing is what makes the commission due — so a
 * consultancy controls when it owes the platform money. This is how the platform notices when
 * that has not happened. Nothing here closes or moves anything: working the queue is a phone
 * call, not a button.
 */
export function useCaseFollowups(includeSnoozed = false) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['case-followups', 'list', includeSnoozed],
    queryFn: async () => {
      const { data, error } = await api.GET('/case-followups', {
        params: { query: { include_snoozed: includeSnoozed } },
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
    queryFn: async () => {
      const { data, error } = await api.GET('/clients/{id}/followups', {
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
