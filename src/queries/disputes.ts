import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type CaseDispute = components['schemas']['CaseDispute']

/** What the platform can do with a frozen case once it has spoken to both sides. */
export const DISPUTE_ACTIONS = [
  {
    value: 'resume',
    label: 'Resume the case',
    detail: 'The consultancy carries on. The plan and chat unfreeze.',
  },
  {
    value: 'reassign',
    label: 'Move the student',
    detail: 'The case goes to Applicant Allocation and stays frozen until you assign a new consultancy.',
  },
  {
    value: 'close',
    label: 'Close the case',
    detail: 'Ends as a failure and reverses any commission. The student returns to Stage 1.',
  },
] as const

export type DisputeAction = (typeof DISPUTE_ACTIONS)[number]['value']

export function useDisputes(status: 'open' | 'resolved' | 'all' = 'open') {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['disputes', status],
    queryFn: async () => {
      const { data, error } = await api.GET('/disputes', { params: { query: { status } } })
      if (error) throw new ApiError('Could not load the dispute queue.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useResolveDispute() {
  const queryClient = useQueryClient()
  return useMutation({
    // `resolutionNote` is required by the server, not merely encouraged: mediation happens off
    // the platform, so this note is the only part of the decision the record ever gets.
    mutationFn: async ({
      id,
      action,
      resolutionNote,
    }: {
      id: string
      action: DisputeAction
      resolutionNote: string
    }) => {
      const { data, error } = await api.POST('/disputes/{id}/resolve', {
        params: { path: { id } },
        body: { action, resolution_note: resolutionNote },
      })
      if (error) throw new ApiError('Could not resolve this dispute.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['applicant-allocation'] })
    },
  })
}
