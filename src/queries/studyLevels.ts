import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// The education ladder (2026-09-07) — ONE list behind both a student's target study level and a
// course's level, because search matches the two against each other. Before this, immiNow's
// course Level was a free-text box ("e.g. masters") while the Sentpo app filtered against a
// hardcoded, title-cased four; a course entered as "MSc" or "PG" was unreachable by every
// student who filtered by level, and nothing anywhere reported it.
//
// Rarely changes, so the same long staleTime as the countries list it sits beside.
// `includeInactive` is for the management screen only — every picker wants the offerable rungs,
// and a retired one must never reappear in a form just because an admin tab is open elsewhere,
// so the two answers are cached under separate keys rather than filtered client-side.
export function useStudyLevels(includeInactive = false) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['study-levels', { includeInactive }],
    queryFn: async () => {
      const { data, error } = await api.GET('/study-levels', {
        params: { query: includeInactive ? { include_inactive: true } : {} },
      })
      if (error) throw new ApiError('Could not load the study levels list.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

// Super Admin only — the ladder every course form and every student app reads from above.
export function useCreateStudyLevel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { code: string; label: string; sort_order?: number }) => {
      const { data, error } = await api.POST('/study-levels', { body })
      if (error) throw new ApiError('Could not add this study level.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['study-levels'] }),
  })
}

// `code` is immutable — a rung is renamed or retired, never re-pointed, because courses and
// student preferences both store the code and neither would be told.
export function useUpdateStudyLevel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      code,
      ...body
    }: {
      code: string
      label?: string
      sort_order?: number
      active?: boolean
    }) => {
      const { data, error } = await api.PATCH('/study-levels/{code}', {
        params: { path: { code } },
        body,
      })
      if (error) throw new ApiError('Could not update this study level.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['study-levels'] }),
  })
}

// For a rung added by mistake (2026-09-11). The server refuses while any course, student or ad
// still carries the code, and its message says which — so the error is shown as sent.
export function useDeleteStudyLevel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      const { error } = await api.DELETE('/study-levels/{code}', { params: { path: { code } } })
      if (error) throw new ApiError(error.error?.message ?? 'Could not delete this study level.')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['study-levels'] }),
  })
}
