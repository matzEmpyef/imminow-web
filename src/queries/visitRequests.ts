import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

export type VisitRequest = components['schemas']['VisitRequest']

/**
 * Support Tools' cross-consultancy list of in-person office visit requests (2026-08-24, "for
 * super admin use a dedicated page"; reworked 2026-09-12 onto the paged/search/summary contract).
 * `responded` is server-computed from the conversation's own unattended state — there is no
 * status to set here beyond nudging; the consultant replying in the actual chat thread is the
 * resolution. `summary` is computed over every request regardless of the current filter, so the
 * filter chips can show counts that don't change as you narrow the list.
 */
export interface VisitRequestsFilters {
  /** Omit for All. */
  responded?: boolean
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useVisitRequests(filters: VisitRequestsFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['visit-requests', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/visit-requests', {
        params: {
          query: {
            filter: filters.responded === undefined ? undefined : { responded: filters.responded ? 'true' : 'false' },
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load visit requests.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/**
 * Reminds the consultancy about a visit request nobody has answered yet — the assigned consultant
 * if there is one, else the consultancy's admins. 409 once they've already replied in the chat,
 * 429 if reminded within the last 24 hours; both surface through the server's own message.
 */
export function useNudgeVisitRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/visit-requests/{id}/nudge', { params: { path: { id } } })
      if (error) throw new ApiError('Could not send a reminder.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visit-requests'] }),
  })
}
