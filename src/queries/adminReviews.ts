import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

export type Review = components['schemas']['Review']

export interface AdminReviewsFilters {
  status?: 'pending' | 'published' | 'hidden'
  consultancy_id?: string
  limit?: number
  cursor?: string
}

/**
 * Platform Reviews moderation queue (2026-09-12) — every student-written review lands here first;
 * nothing shows in the app until a Consultancies-permission holder (`consultancy_approval`)
 * publishes it. `counts` always carries the per-status totals regardless of the active `status`
 * filter, so the Pending/Published/Hidden tab chips never need a second request.
 *
 * Cursor-paginated (contract gate 10b item 8 — was `limit`/`offset`/`total`; same `meta.next_cursor`
 * shape as every other cursor list in the console, consumed via `useCursorPagination`). The mock
 * stays offset-paginated per the plan, so this only lines up against the real backend.
 */
export function useAdminReviews(filters: AdminReviewsFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-reviews', filters],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/admin/reviews', { signal, params: { query: filters } })
      if (error) throw new ApiError('Could not load reviews.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/**
 * Publish or hide one review. Hiding requires `reason` — the server 400s `validation_failed` with
 * `details.reason = 'required'` otherwise, since the reason is the audit trail for taking a
 * verified student's words down. Publishing notifies the consultancy's admins; hiding notifies
 * nobody. A hidden review can always be published again.
 */
export function useModerateReview(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { status: 'published' | 'hidden'; reason?: string }) => {
      const { data, error } = await api.PATCH('/admin/reviews/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this review.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reviews'] }),
  })
}
