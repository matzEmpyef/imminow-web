import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

export type ReviewPage = components['schemas']['ReviewPage']

/**
 * Read-only published reviews for the signed-in consultancy, with the rating summary (2026-09-12)
 * — Consultancy Management's Reviews page. `id: 'me'` reads the caller's own consultancy, same
 * convention `useMyConsultancy` uses for `/consultancies/me`. Pending and hidden reviews never
 * appear here — only what a platform admin has published.
 */
export function useMyReviews(filters: { limit?: number; offset?: number } = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['consultancy-reviews', 'me', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/consultancies/{id}/reviews', {
        params: { path: { id: 'me' }, query: filters },
      })
      if (error) throw new ApiError('Could not load reviews.', error)
      return data
    },
    enabled: isAuthed,
  })
}
