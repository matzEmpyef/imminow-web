import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type ConsultancyCreateInput = components['schemas']['ConsultancyCreateInput']
type ConsultancyAdminPatchInput = components['schemas']['ConsultancyAdminPatchInput']

export interface ConsultancyFilters {
  search?: string
  tier?: 'starter' | 'business' | 'ultimate'
  active?: boolean
  sort?: string
  cursor?: string
  limit?: number
}

export function useAdminConsultancies(filters: ConsultancyFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-consultancies', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/consultancies', { params: { query: filters } })
      if (error) throw new ApiError('Could not load consultancies.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreateConsultancy() {
  const queryClient = useQueryClient()
  return useMutation({
    // T8: key minted once per modal open by the caller — a per-attempt UUID defeated the header.
    mutationFn: async ({ idempotencyKey, ...body }: ConsultancyCreateInput & { idempotencyKey: string }) => {
      const { data, error } = await api.POST('/consultancies', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body,
      })
      if (error) throw new ApiError('Could not create this consultancy.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-consultancies'] }),
  })
}

function invalidateConsultancy(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: ['admin-consultancies'] })
  queryClient.invalidateQueries({ queryKey: ['admin-consultancies', id] })
}

export function useChangeTier(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tier: 'starter' | 'business' | 'ultimate') => {
      const { data, error } = await api.PATCH('/consultancies/{id}/tier', { params: { path: { id } }, body: { tier } })
      if (error) throw new ApiError("Could not change this consultancy's plan.", error)
      return data
    },
    onSuccess: () => invalidateConsultancy(queryClient, id),
  })
}

export function useUpdateEntitlements(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ConsultancyAdminPatchInput) => {
      const { data, error } = await api.PATCH('/consultancies/{id}/entitlements', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update features/limits.', error)
      return data
    },
    onSuccess: () => invalidateConsultancy(queryClient, id),
  })
}

export function useSuspendConsultancy(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/consultancies/{id}/suspend', { params: { path: { id } } })
      if (error) throw new ApiError('Could not suspend this consultancy.', error)
      return data
    },
    onSuccess: () => invalidateConsultancy(queryClient, id),
  })
}

/**
 * Sets or clears the Super Admin rating override.
 *
 * Passing `null` CLEARS the override and returns the consultancy to its computed rating — it does
 * not blank the rating out. The computed value is never overwritten, so this is always reversible.
 */
export function useSetConsultancyRating(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ rating, reason }: { rating: number | null; reason?: string }) => {
      const { data, error } = await api.PATCH('/consultancies/{id}/rating', {
        params: { path: { id } },
        body: { rating, reason },
      })
      if (error) throw new ApiError('Could not update this rating.', error)
      return data
    },
    onSuccess: () => invalidateConsultancy(queryClient, id),
  })
}

export function useReactivateConsultancy(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/consultancies/{id}/reactivate', { params: { path: { id } } })
      if (error) throw new ApiError('Could not reactivate this consultancy.', error)
      return data
    },
    onSuccess: () => invalidateConsultancy(queryClient, id),
  })
}

export type TierDowngradeImpact = components['schemas']['TierDowngradeImpact']

/**
 * What a tier change would disable, BEFORE it happens.
 *
 * Downgrading auto-disables employees past the new seat cap and deactivates every branch but the
 * primary. The user's call (2026-08-23) was to warn rather than block — "tell super admin that
 * these things are over limit (in case the admin wants to resolve it first), but still let super
 * admin to disable silently". So this is advisory: it never gates the save.
 *
 * Only fetched when a downgrade is actually selected — asking for the impact of the tier they are
 * already on would be a pointless request.
 */
export function useTierImpact(id: string, tier: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['tier-impact', id, tier],
    queryFn: async () => {
      const { data, error } = await api.GET('/consultancies/{id}/tier-impact', {
        params: { path: { id }, query: { tier: tier as never } },
      })
      if (error) throw new ApiError('Could not check what this tier change would affect.', error)
      return data
    },
    enabled: enabled && Boolean(tier),
  })
}
