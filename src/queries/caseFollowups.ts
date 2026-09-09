import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type CaseFollowupRow = components['schemas']['CaseFollowupRow']

/**
 * Cases the payments team should chase.
 *
 * Closing a case is a consultancy action, and closing is what makes the commission due — so a
 * consultancy controls when it owes the platform money. This is how the platform notices when
 * that has not happened. Nothing here closes or moves anything: working the queue is a phone
 * call, not a button.
 */
export function useCaseFollowups() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['case-followups'],
    queryFn: async () => {
      const { data, error } = await api.GET('/case-followups')
      if (error) throw new ApiError('Could not load the follow-up queue.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/** Record that someone called. No status, no assignment — it exists so the next person knows. */
export function useRecordFollowup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ journeyId, note }: { journeyId: string; note: string }) => {
      const { data, error } = await api.POST('/clients/{id}/followups', {
        params: { path: { id: journeyId } },
        body: { note },
      })
      if (error) throw new ApiError('Could not save this note.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case-followups'] }),
  })
}
