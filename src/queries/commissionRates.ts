import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type CommissionRateInput = components['schemas']['CommissionRateInput']

export function useCommissionRates(consultancyId?: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['commission-rates', consultancyId],
    queryFn: async () => {
      const { data, error } = await api.GET('/commission-rates', {
        params: { query: consultancyId ? { consultancy_id: consultancyId } : {} },
      })
      if (error) throw new ApiError('Could not load commission rates.')
      return data
    },
    enabled: isAuthed,
  })
}

// Consultancy-side, read-only (user-requested, 2026-08-19 — "the commission rates set must be
// visible for consultancy under Consultancy Management tab").
export function useMyCommissionRates() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['commission-rates', 'me'],
    queryFn: async () => {
      const { data, error } = await api.GET('/commission-rates/me')
      if (error) throw new ApiError('Could not load your commission rates.')
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreateCommissionRate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CommissionRateInput) => {
      const { data, error } = await api.POST('/commission-rates', { body })
      if (error) throw new ApiError('Could not create this rate.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commission-rates'] }),
  })
}

export function useUpdateCommissionRate(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { direct_rate?: number; freelancer_sourced_rate?: number }) => {
      const { data, error } = await api.PATCH('/commission-rates/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this rate.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commission-rates'] }),
  })
}
