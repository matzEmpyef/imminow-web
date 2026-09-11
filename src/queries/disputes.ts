import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

export type CaseDispute = components['schemas']['CaseDispute']
export type SupportCaseNote = components['schemas']['SupportCaseNote']
export type DisputeNoteOutcome = NonNullable<SupportCaseNote['outcome']>

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

/**
 * The platform's dispute queue (rebuilt 2026-09-11 on the paged contract). A dispute is not a way
 * of closing a case — it is the state a case sits in WHILE the platform decides. Both sides land
 * here: a consultancy raising an issue, and (via the complaint escalate flow) a student raising one.
 */
export interface DisputesFilters {
  status?: 'open' | 'resolved' | 'all'
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useDisputes(filters: DisputesFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['disputes', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/disputes', {
        params: {
          query: {
            filter: filters.status ? { status: filters.status } : undefined,
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load the dispute queue.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/** Take ownership of an open dispute — used for both the first pick-up and taking it over from someone else. 409 once resolved. */
export function usePickUpDispute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/disputes/{id}/pick-up', { params: { path: { id } } })
      if (error) throw new ApiError('Could not pick up this dispute.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] })
      queryClient.invalidateQueries({ queryKey: ['admin-attention'] })
    },
  })
}

export function useDisputeNotes(id: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['dispute-notes', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/disputes/{id}/notes', { params: { path: { id } } })
      if (error) throw new ApiError('Could not load the notes on this dispute.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}

/** Adds a working note. 409 once the dispute is resolved — its record is closed. */
export function useAddDisputeNote(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { note: string; outcome?: DisputeNoteOutcome }) => {
      const { data, error } = await api.POST('/disputes/{id}/notes', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not add this note.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispute-notes', id] })
      queryClient.invalidateQueries({ queryKey: ['disputes'] })
    },
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
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['applicant-allocation'] })
      queryClient.invalidateQueries({ queryKey: ['admin-attention'] })
    },
  })
}
