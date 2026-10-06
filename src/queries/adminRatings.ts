import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

export type AdminRating = components['schemas']['AdminRating']

export interface AdminRatingsFilters {
  consultancy_id?: string
  /** Everything one account rated. */
  student_id?: string
  /** true: only ratings with at least one signal. */
  flagged?: boolean
  /** true: only excluded ratings; false: only counted ones. */
  excluded?: boolean
  cursor?: string
  limit?: number
}

/**
 * Every student rating, for platform staff (owner decision 16, review F-012): who rated whom, with
 * the signals that suggest a manufactured rating. Consultancies permission (`consultancy_approval`),
 * the same holder who moderates reviews. Most recently rated first, cursor-paginated. `counts`
 * carries the platform-wide totals whatever the filter, so the chips need no second request.
 *
 * Nothing here is ever served to a consultancy or to a student.
 */
export function useAdminRatings(filters: AdminRatingsFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-ratings', filters],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/admin/ratings', { signal, params: { query: filters } })
      if (error) throw new ApiError('Could not load ratings.', error)
      return data
    },
    enabled: isAuthed,
    // The last page stays up while the next filter or page loads, so the chips keep their counts
    // and the table does not blink empty between two answers.
    placeholderData: keepPreviousData,
  })
}

/**
 * Take one rating out of its consultancy's score, or put it back. Excluding needs `reason` (the
 * server answers 400 `validation_failed` with `details.reason = 'required'` otherwise). The
 * consultancy's rating changes at once; the student is not told. Sending the state a rating is
 * already in changes nothing, so a repeated click cannot apply twice.
 *
 * The consultancy list and the review queue show numbers this moves, so they are refreshed too.
 */
export function useSetRatingExcluded(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { excluded: true; reason: string } | { excluded: false }) => {
      const { data, error } = await api.PATCH('/admin/ratings/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this rating.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ratings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] })
      queryClient.invalidateQueries({ queryKey: ['admin-consultancies'] })
    },
  })
}
