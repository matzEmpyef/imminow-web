import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useFreelancerReferrals() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['freelancer-referrals'],
    queryFn: async () => {
      const { data, error } = await api.GET('/freelancer/referrals')
      if (error) throw new ApiError('Could not load your referrals.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/** Super Admin payout ledger — every referral platform-wide, with freelancer names (2026-08-19). */
export function useAllFreelancerReferrals() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['freelancer-referrals-admin'],
    queryFn: async () => {
      const { data, error } = await api.GET('/freelancer-referrals')
      if (error) throw new ApiError('Could not load freelancer referrals.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/** Marks a referral owed/paid (Super Admin). Records the fact — money moves outside the platform. */
export function useMarkReferralPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payment_status }: { id: string; payment_status: 'owed' | 'paid' }) => {
      const { data, error } = await api.PATCH('/freelancer-referrals/{id}', {
        params: { path: { id } },
        body: { payment_status },
      })
      if (error) throw new ApiError('Could not update the payout status.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['freelancer-referrals-admin'] }),
  })
}

/** The logged-in freelancer's own referral identity — code + ready-to-share URL (2026-08-19). */
export function useFreelancerMe() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['freelancer-me'],
    queryFn: async () => {
      const { data, error } = await api.GET('/freelancer/me')
      if (error) throw new ApiError('Could not load your referral link.', error)
      return data
    },
    enabled: isAuthed,
  })
}
