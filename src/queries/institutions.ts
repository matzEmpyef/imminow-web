import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type Institution = components['schemas']['Institution']
export type InstitutionSuggestion = components['schemas']['InstitutionSuggestion']

/**
 * The student's own school or college — NOT `colleges`, which are destinations abroad.
 *
 * `q` matches name and city together, so "choice thiruvalla" finds the Thiruvalla Choice School
 * rather than the Kochi one. Every label must show the city for the same reason: name alone is not
 * an identity here.
 */
export function useInstitutions(q?: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['institutions', q ?? ''],
    queryFn: async () => {
      const { data, error } = await api.GET('/institutions', {
        params: { query: { q: q || undefined, limit: 100 } },
      })
      if (error) throw new ApiError('Could not load institutions.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

export interface InstitutionListFilters {
  q?: string
  type?: 'school' | 'college'
  city?: string
  state?: string
  status?: 'active' | 'retired' | 'all'
  sort?: string
  cursor?: string
  limit?: number
}

// The admin list (2026-09-11) — paged and filtered on the server; it used to be the first 100 rows.
export function useAdminInstitutions(filters: InstitutionListFilters) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['institutions', 'admin', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/institutions', { params: { query: filters } })
      if (error) throw new ApiError('Could not load institutions.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/** The platform-staff mapping queue. Its size is the honest measure of how stale institution filters are. */
export function useInstitutionSuggestions() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['institution-suggestions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/institutions/suggestions')
      if (error) throw new ApiError('Could not load the institution queue.', error)
      return data
    },
    enabled: isAuthed,
  })
}

function invalidateInstitutions(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['institutions'] })
  queryClient.invalidateQueries({ queryKey: ['institution-suggestions'] })
}

export function useCreateInstitution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: components['schemas']['InstitutionInput']) => {
      const { data, error } = await api.POST('/institutions', { body })
      if (error) throw new ApiError(error.error?.message ?? 'Could not create this institution.')
      return data
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

export function useUpdateInstitution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string
      name?: string
      city?: string
      state?: string | null
      type?: 'school' | 'college'
      active?: boolean
    }) => {
      const { data, error } = await api.PATCH('/institutions/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError(error.error?.message ?? 'Could not update this institution.')
      return data
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

export function useMergeInstitution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, intoId }: { id: string; intoId: string }) => {
      const { data, error } = await api.POST('/institutions/{id}/merge', {
        params: { path: { id } },
        body: { into_id: intoId },
      })
      if (error) throw new ApiError(error.error?.message ?? 'Could not merge these institutions.')
      return data
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

export function useResolveInstitutionSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, institutionId }: { userId: string; institutionId: string }) => {
      const { data, error } = await api.POST('/institutions/suggestions/{user_id}/resolve', {
        params: { path: { user_id: userId } },
        body: { institution_id: institutionId },
      })
      if (error) throw new ApiError(error.error?.message ?? 'Could not map this student.')
      return data
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

export function useDismissInstitutionSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, note }: { userId: string; note?: string }) => {
      const { data, error } = await api.POST('/institutions/suggestions/{user_id}/dismiss', {
        params: { path: { user_id: userId } },
        body: note ? { note } : {},
      })
      if (error) throw new ApiError(error.error?.message ?? 'Could not clear this entry.')
      return data
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

/**
 * How to render one. The city is baked into the stored NAME (user, 2026-08-27), so the name alone is
 * already unambiguous. Kept as a function so the rule lives in one place.
 */
export const institutionLabel = (i: Pick<Institution, 'name'>) => i.name
