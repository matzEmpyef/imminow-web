import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type FreelancerRateInput = components['schemas']['FreelancerRateInput']

export type Freelancer = components['schemas']['Freelancer']

// The whole roster — small enough (per the contract note on GET /freelancers) that search and
// status filtering happen client-side on FreelancersPage rather than adding server paging for a
// list that will not grow into the hundreds any time soon.
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

export interface InviteFreelancerInput {
  first_name: string
  last_name: string
  email: string
  referral_code: string
  phone?: string
  rate?: number
}

/**
 * Invites a freelancer (2026-09-11 rebuild — freelancer accounts used to only ever exist as rows
 * created elsewhere; this is the first place one is actually created). The referral code is typed
 * by the admin, not generated — 409 code_taken / email_taken and 400 on a malformed code are
 * server-checked and surfaced verbatim via ApiError's message fallback.
 */
export function useInviteFreelancer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: InviteFreelancerInput) => {
      const { data, error } = await api.POST('/freelancers', { body })
      if (error) throw new ApiError('Could not invite this freelancer.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['freelancers'] }),
  })
}

/** Sends the set-password invite email again with a fresh link. 409 once they have already joined. */
export function useResendFreelancerInvite() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST('/freelancers/{id}/resend-invite', { params: { path: { id } } })
      if (error) throw new ApiError('Could not resend this invite.', error)
    },
  })
}

export interface UpdateFreelancerInput {
  id: string
  active?: boolean
  /** Typed, capitalised, unique — retires the old code the instant it changes (server-enforced). */
  referral_code?: string
}

/**
 * One PATCH endpoint covers both activate/deactivate and changing the referral code, so this is
 * the one mutation hook for both — Deactivating revokes sign-in immediately and stops the old
 * code attributing new students; changing the code retires the old one at once while students
 * already referred through it stay attributed. Neither ever removes the row.
 */
export function useUpdateFreelancer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateFreelancerInput) => {
      const { data, error } = await api.PATCH('/freelancers/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this freelancer.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freelancers'] })
      // Payout/referral rows are labelled by freelancer name and code; either can change here.
      queryClient.invalidateQueries({ queryKey: ['freelancer-referrals-admin'] })
      queryClient.invalidateQueries({ queryKey: ['freelancer-payouts-admin'] })
    },
  })
}

export type FreelancerRate = components['schemas']['FreelancerRate']

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
      if (error) throw new ApiError('Could not set this share.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freelancer-rates'] })
      queryClient.invalidateQueries({ queryKey: ['freelancers'] })
    },
  })
}

export function useUpdateFreelancerRate(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rate: number) => {
      const { data, error } = await api.PATCH('/freelancer-rates/{id}', { params: { path: { id } }, body: { rate } })
      if (error) throw new ApiError('Could not update this share.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freelancer-rates'] })
      queryClient.invalidateQueries({ queryKey: ['freelancers'] })
    },
  })
}
