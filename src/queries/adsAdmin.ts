import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type AdBannerInput = components['schemas']['AdBannerInput']

export function useAdminAds() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-ads'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/ads', { signal })
      if (error) throw new ApiError('Could not load ads.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// Who clicked an ad (user 2026-08-20) — fetched only while the drill-down popup is open.
// Cursor-paginated (contract gate 10b item 4 — `cursor`/`limit` added), same `useCursorPagination`
// pattern as every other cursor list in the console; the page owns the cursor and resets it
// whenever a different ad's drill-down opens.
export function useAdClicks(adId: string | null, params: { cursor?: string; limit?: number } = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['ads', adId, 'clicks', params],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/ads/{id}/clicks', {
        signal,
        params: { path: { id: adId! }, query: { cursor: params.cursor, limit: params.limit } },
      })
      if (error) throw new ApiError('Could not load ad clicks.', error)
      return data
    },
    enabled: isAuthed && Boolean(adId),
  })
}

export function useCreateAd() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: AdBannerInput) => {
      const { data, error } = await api.POST('/ads', { body })
      if (error) throw new ApiError('Could not create this ad.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ads'] }),
  })
}

// The expected audience of a draft ad is counted by the shared `useAudienceCount`
// (`queries/audienceCount.ts`), the same hook broadcasts and events use.

export function useUpdateAd(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<AdBannerInput>) => {
      const { data, error } = await api.PATCH('/ads/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this ad.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ads'] }),
  })
}

// New (2026-09-11) — DELETE /ads/{id} is permanent, unlike PATCH { active: false } which just
// stops serving the ad and stays reversible. Kept as its own mutation, not folded into
// useUpdateAd, so the two can never be confused at a call site.
export function useDeleteAd() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/ads/{id}', { params: { path: { id } } })
      if (error) throw new ApiError('Could not delete this ad.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ads'] }),
  })
}
