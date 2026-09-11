import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// The managed Fields of Study list (2026-09-11) — one list behind a course's field and a
// student's fields of interest, each field with alternate names that search and filters also
// match ("CS" → Computer Science). Like the study levels ladder beside it, pickers want the active
// fields and the management tab wants them all, so the two are cached under separate keys.
export function useFieldsOfStudy(includeInactive = false) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['fields-of-study', { includeInactive }],
    queryFn: async () => {
      const { data, error } = await api.GET('/fields-of-study', {
        params: { query: includeInactive ? { include_inactive: true } : {} },
      })
      if (error) throw new ApiError('Could not load the fields of study list.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

// A rename or merge rewrites the field on courses and preferences, so everything that shows a
// course's field — lists, the Course Finder's chips — is stale afterwards too.
function invalidateFieldViews(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['fields-of-study'] })
  queryClient.invalidateQueries({ queryKey: ['course-fields'] })
  queryClient.invalidateQueries({ queryKey: ['courses'] })
  queryClient.invalidateQueries({ queryKey: ['college-detail'] })
}

export function useCreateFieldOfStudy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; aliases: string[] }) => {
      const { data, error } = await api.POST('/fields-of-study', { body })
      if (error) throw new ApiError(error.error?.message ?? 'Could not add this field.')
      return data
    },
    onSuccess: () => invalidateFieldViews(queryClient),
  })
}

export function useUpdateFieldOfStudy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; aliases?: string[]; active?: boolean }) => {
      const { data, error } = await api.PATCH('/fields-of-study/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError(error.error?.message ?? 'Could not update this field.')
      return data
    },
    onSuccess: () => invalidateFieldViews(queryClient),
  })
}

export function useMergeFieldOfStudy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, intoId }: { id: string; intoId: string }) => {
      const { data, error } = await api.POST('/fields-of-study/{id}/merge', {
        params: { path: { id } },
        body: { into_id: intoId },
      })
      if (error) throw new ApiError(error.error?.message ?? 'Could not merge these fields.')
      return data
    },
    onSuccess: () => invalidateFieldViews(queryClient),
  })
}
