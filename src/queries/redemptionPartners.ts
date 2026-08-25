import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type RedemptionPartnerInput = components['schemas']['RedemptionPartnerInput']
type PartnerLocationInput = components['schemas']['PartnerLocationInput']

export function useRedemptionPartners() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['redemption-partners'],
    queryFn: async () => {
      const { data, error } = await api.GET('/redemption-partners')
      if (error) throw new ApiError('Could not load redemption partners.')
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreatePartner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: RedemptionPartnerInput) => {
      const { data, error } = await api.POST('/redemption-partners', { body })
      if (error) throw new ApiError('Could not create this partner.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['redemption-partners'] }),
  })
}

export function useUpdatePartner(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<RedemptionPartnerInput>) => {
      const { data, error } = await api.PATCH('/redemption-partners/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this partner.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['redemption-partners'] }),
  })
}

export function useAddLocation(partnerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: PartnerLocationInput) => {
      const { data, error } = await api.POST('/redemption-partners/{id}/locations', {
        params: { path: { id: partnerId } },
        body,
      })
      if (error) throw new ApiError('Could not add this location.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['redemption-partners'] }),
  })
}

// `code` added (2026-08-18) — "if possible redemption code can be set by us." Omit it to keep
// the original random-generation behavior; pass it to set a specific code instead.
export function useRotateCode(partnerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ locationId, code }: { locationId?: string; code?: string } = {}) => {
      const { data, error } = await api.POST('/redemption-partners/{id}/rotate-code', {
        params: { path: { id: partnerId } },
        body: { location_id: locationId, code },
      })
      if (error) throw new ApiError('Could not update the code.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['redemption-partners'] }),
  })
}
