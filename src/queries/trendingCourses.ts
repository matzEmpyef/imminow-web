import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

const KEY = ['admin-trending-courses']

// The curated Trending Courses rail (user, 2026-09-16). Read as the admin stores it — order
// included, and with courses that have stopped being servable still listed and flagged, which is
// what the student-facing GET /courses/trending deliberately does not do.
export function useTrendingCourses() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/trending-courses')
      if (error) throw new ApiError('Could not load Trending Courses.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// One call sends the WHOLE ordered list, matching the endpoint: reordering is a single decision,
// so a move that shifts several rows saves as one thing or not at all.
export function useSaveTrendingCourses() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (courseIds: string[]) => {
      const { data, error } = await api.POST('/admin/trending-courses', {
        body: { course_ids: courseIds },
      })
      if (error) throw new ApiError('Could not save Trending Courses.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}
