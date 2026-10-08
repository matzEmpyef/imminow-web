import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
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
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/study-levels', {
        signal,
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

/** What a reorder says when the server refuses it (400): the ladder is no longer the one loaded. */
export const LADDER_CHANGED_NOTICE = 'The list changed while you were reordering. It has been reloaded.'

// The whole ladder in its new order, in ONE request (2026-10-08): `codes` is every rung's code —
// retired rungs included — exactly once. It used to be one PATCH per rung moved, and a move that
// half-landed left two rungs sharing a place. All or nothing on the server: a list that misses a
// rung, repeats one or names one that is gone changes nothing and answers 400, which means the
// ladder changed since it was loaded — so it is read again and the person is told.
export function useReorderStudyLevels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (codes: string[]) => {
      const { data, error } = await api.POST('/study-levels/reorder', { body: { codes } })
      if (error) {
        const refused = new ApiError('Could not reorder the study levels.', error)
        if (refused.status !== 400) throw refused
        throw new ApiError(LADDER_CHANGED_NOTICE, { error: { ...error.error, message: LADDER_CHANGED_NOTICE } }, 400)
      }
      return data
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['study-levels'] }),
  })
}

// For a rung added by mistake (2026-09-11). The server refuses while any course, student or ad
// still carries the code, and its message says which — so the error is shown as sent.
export function useDeleteStudyLevel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      const { error } = await api.DELETE('/study-levels/{code}', { params: { path: { code } } })
      if (error) throw new ApiError('Could not delete this study level.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['study-levels'] }),
  })
}
