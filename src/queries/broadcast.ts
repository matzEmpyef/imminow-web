import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useDebouncedValue } from '@/lib/useDebounce'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type BroadcastInput = components['schemas']['BroadcastInput']
type Audience = NonNullable<BroadcastInput['audience']>
type Targeting = components['schemas']['Targeting']

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

// How many people a compose draft would reach, live as the sender edits audience/targeting
// (notifications permission, review C3, 2026-09-12). Targeting is debounced ~400ms — the segment
// filter has free-text-adjacent controls that change on every keystroke/drag, and firing a POST
// per change would spam the server with counts the sender never saw land. Mirrors
// adsAdmin.ts's useAdAudienceCount shape, just POST-bodied instead of query-stringed (the
// Targeting object is too shaped for query params) and debounced since ads' targeting is
// select-only.
export function useBroadcastAudienceCount(audience: Audience, targeting: Targeting) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const debouncedTargeting = useDebouncedValue(targeting, 400)
  const effectiveTargeting = audience === 'segment' ? debouncedTargeting : undefined
  return useQuery({
    queryKey: ['broadcast-audience-count', audience, effectiveTargeting],
    queryFn: async () => {
      const { data, error } = await api.POST('/broadcast/audience-count', {
        body: { audience, targeting: effectiveTargeting },
      })
      if (error) throw new ApiError('Could not compute the matching audience.', error)
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
