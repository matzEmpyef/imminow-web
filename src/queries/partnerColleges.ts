import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type PartnerCollege = components['schemas']['ConsultancyCollege']
export type PayerMethod = PartnerCollege['payer_method']

// Partner Colleges (COURSES_MODULE_PLAN.md §1.7/§4.2, workstream F). One hook set serves BOTH
// the consultancy's own tab (no consultancyId — the server resolves the caller's) and the
// platform-admin on-behalf modal in Manage Consultancies (consultancyId passed as
// ?consultancy_id, which the server only honors for platform accounts).
export function usePartnerColleges(consultancyId?: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['partner-colleges', consultancyId ?? 'me'],
    queryFn: async () => {
      const { data, error } = await api.GET('/consultancy-colleges', {
        params: { query: consultancyId ? { consultancy_id: consultancyId } : {} },
      })
      if (error) throw new ApiError('Could not load partner colleges.')
      return data
    },
    enabled: isAuthed,
  })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, consultancyId?: string) {
  queryClient.invalidateQueries({ queryKey: ['partner-colleges', consultancyId ?? 'me'] })
}

export function useAddPartnerCollege(consultancyId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: components['schemas']['ConsultancyCollegeInput']) => {
      const { data, error } = await api.POST('/consultancy-colleges', {
        params: { query: consultancyId ? { consultancy_id: consultancyId } : {} },
        body,
      })
      if (error) throw new ApiError('Could not add this college.')
      return data
    },
    onSuccess: () => invalidate(queryClient, consultancyId),
  })
}

export function useUpdatePartnerCollege(consultancyId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Partial<components['schemas']['ConsultancyCollegeInput']>) => {
      const { data, error } = await api.PATCH('/consultancy-colleges/{id}', {
        params: { path: { id }, query: consultancyId ? { consultancy_id: consultancyId } : {} },
        body,
      })
      if (error) throw new ApiError('Could not update this college.')
      return data
    },
    onSuccess: () => invalidate(queryClient, consultancyId),
  })
}

export function useRemovePartnerCollege(consultancyId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/consultancy-colleges/{id}', {
        params: { path: { id }, query: consultancyId ? { consultancy_id: consultancyId } : {} },
      })
      if (error) throw new ApiError('Could not remove this college.')
    },
    onSuccess: () => invalidate(queryClient, consultancyId),
  })
}
