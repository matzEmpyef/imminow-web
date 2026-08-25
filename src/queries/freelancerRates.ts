import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type FreelancerRateInput = components['schemas']['FreelancerRateInput']

export function useFreelancers() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['freelancers'],
    queryFn: async () => {
      const { data, error } = await api.GET('/freelancers')
      if (error) throw new ApiError('Could not load freelancers.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useFreelancerRates() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['freelancer-rates'],
    queryFn: async () => {
      const { data, error } = await api.GET('/freelancer-rates')
      if (error) throw new ApiError('Could not load freelancer rates.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreateFreelancerRate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: FreelancerRateInput) => {
      const { data, error } = await api.POST('/freelancer-rates', { body })
      if (error) throw new ApiError('Could not set this rate.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['freelancer-rates'] }),
  })
}

export function useUpdateFreelancerRate(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rate: number) => {
      const { data, error } = await api.PATCH('/freelancer-rates/{id}', { params: { path: { id } }, body: { rate } })
      if (error) throw new ApiError('Could not update this rate.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['freelancer-rates'] }),
  })
}

/**
 * Activate or deactivate a freelancer account.
 *
 * Deactivating revokes their sign-in immediately and stops their referral code attributing new
 * students — the code path already filtered on `active`, it just had no way to be set until the
 * endpoint landed (2026-08-23). Reversible, and it never removes the row: payouts already earned
 * on students they referred stay owed and visible.
 */
export function useSetFreelancerActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data, error } = await api.PATCH('/freelancers/{id}', {
        params: { path: { id } },
        body: { active },
      })
      if (error) throw new ApiError(error.error?.message ?? 'Could not update this freelancer.')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freelancers'] })
      // Payout rows are labelled by freelancer, and a deactivated one reads differently.
      queryClient.invalidateQueries({ queryKey: ['freelancer-payouts'] })
    },
  })
}
