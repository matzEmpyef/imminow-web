import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

interface ModerationQueueFilters {
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useModerationQueue(
  status: 'pending' | 'approved' | 'rejected' = 'pending',
  filters: ModerationQueueFilters = {},
) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['moderation-course-suggestions', status, filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/moderation/course-suggestions', {
        params: {
          query: {
            filter: { status },
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load the review queue.')
      return data
    },
    enabled: isAuthed,
  })
}

// `mode`/`value` (2026-08-24) only matter for a `type: correction` suggestion — Add applies the
// consultant's own value, Add with modification applies `value` instead, and "I will add
// manually" records the suggestion as accepted without touching the course. Omitted entirely for
// `type: new`, which has no modes; the server defaults to `as_suggested` there and it is inert.
export function useApproveCourseSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      mode,
      value,
    }: {
      id: string
      mode?: 'as_suggested' | 'modified' | 'manual'
      value?: string
    }) => {
      const { data, error } = await api.POST('/moderation/course-suggestions/{id}/approve', {
        params: { path: { id } },
        body: mode ? { mode, value } : undefined,
      })
      if (error) throw new ApiError('Could not approve this suggestion.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moderation-course-suggestions'] }),
  })
}

export function useRejectCourseSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/moderation/course-suggestions/{id}/reject', {
        params: { path: { id } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not reject this suggestion.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moderation-course-suggestions'] }),
  })
}
