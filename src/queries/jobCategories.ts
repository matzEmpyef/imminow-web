import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// The managed Job Categories list (owner decision 69c, 2026-10-08) — the one list behind a job
// listing's category, kept by the platform team in Settings. Modelled on the Fields of Study list
// beside it: the job form's picker wants the active categories and the management tab wants them
// all, so the two are cached under separate keys.
export function useJobCategories(includeInactive = false) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['job-categories', { includeInactive }],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/job-categories', {
        signal,
        params: { query: includeInactive ? { include_inactive: true } : {} },
      })
      if (error) throw new ApiError('Could not load the job categories list.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

// A rename or merge rewrites the category on the listings filed under it, so the Jobs list is
// stale afterwards too.
function invalidateCategoryViews(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['job-categories'] })
  queryClient.invalidateQueries({ queryKey: ['admin-jobs'] })
}

export function useCreateJobCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string }) => {
      const { data, error } = await api.POST('/job-categories', { body })
      if (error) throw new ApiError('Could not add this category.', error)
      return data
    },
    onSuccess: () => invalidateCategoryViews(queryClient),
  })
}

export function useUpdateJobCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; active?: boolean }) => {
      const { data, error } = await api.PATCH('/job-categories/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this category.', error)
      return data
    },
    onSuccess: () => invalidateCategoryViews(queryClient),
  })
}

export function useMergeJobCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, intoId }: { id: string; intoId: string }) => {
      const { data, error } = await api.POST('/job-categories/{id}/merge', {
        params: { path: { id } },
        body: { into_id: intoId },
      })
      if (error) throw new ApiError('Could not merge these categories.', error)
      return data
    },
    onSuccess: () => invalidateCategoryViews(queryClient),
  })
}
