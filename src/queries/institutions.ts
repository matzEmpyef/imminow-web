import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export function useCreateInstitution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: components['schemas']['InstitutionInput']) => {
      const { data, error } = await api.POST('/institutions', { body })
      if (error) throw new ApiError('Could not create this institution.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institutions'] })
      queryClient.invalidateQueries({ queryKey: ['institution-suggestions'] })
    },
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
      if (error) throw new ApiError('Could not map this student.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['institution-suggestions'] }),
  })
}

/**
 * How to render one. The city is baked into the stored NAME (user, 2026-08-27), so the name alone is
 * already unambiguous. Kept as a function so the rule lives in one place.
 */
export const institutionLabel = (i: Pick<Institution, 'name'>) => i.name
