import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type BroadcastInput = components['schemas']['BroadcastInput']

interface BroadcastHistoryFilters {
  audience?: 'all_students' | 'segment' | 'all_staff'
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useBroadcastHistory(filters: BroadcastHistoryFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['broadcast-history', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/broadcast', {
        params: {
          query: {
            filter: filters.audience ? { audience: filters.audience } : undefined,
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load broadcast history.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useSendBroadcast() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: BroadcastInput) => {
      const { data, error } = await api.POST('/broadcast', { body })
      // The server's own message names the problem — an unroutable destination, most likely —
      // and swallowing it would leave the sender guessing at a form they can still fix.
      if (error) throw new ApiError(error.error?.message ?? 'Could not send this broadcast.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['broadcast-history'] }),
  })
}
