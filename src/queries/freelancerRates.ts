import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { fetchAllPages, toPage } from '@/lib/pagination'
import type { components } from '@/api/schema'

type FreelancerRateInput = components['schemas']['FreelancerRateInput']

export type Freelancer = components['schemas']['Freelancer']

// One page of the roster (contract gate 12 — `GET /freelancers` is cursor-paged; the frozen mock
// still returns the plain array, which `toPage` reads as one complete page, so no pager shows).
// Search and the status filter stay client-side over the page in view.
export function useFreelancers(cursor?: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['freelancers', 'page', cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await api.GET('/freelancers', { params: { query: { cursor } } })
      if (error) throw new ApiError('Could not load freelancers.', error)
      return toPage(data)
    },
    enabled: isAuthed,
  })
}

// The whole roster, every page walked (100 rows a request). For the places that need the full set
// rather than one screenful: the payouts pages' freelancer picker and the summary tiles' totals.
// `enabled: false` lets a caller that already holds the complete list skip the extra walk.
export function useAllFreelancers(options: { enabled?: boolean } = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['freelancers', 'all'],
    queryFn: async () => {
      return fetchAllPages<Freelancer>(async (cursor) => {
        const { data, error } = await api.GET('/freelancers', { params: { query: { cursor, limit: 100 } } })
        if (error) throw new ApiError('Could not load freelancers.', error)
        const page = toPage(data)
        return { items: page.items, meta: page.meta ?? {} }
      })
    },
    enabled: isAuthed && (options.enabled ?? true),
  })
}

export interface InviteFreelancerInput {
  first_name: string
  last_name: string
  email: string
  referral_code: string
  phone?: string
  // Required at invite (assumptions audit C7, approved 2026-09-19) — a freelancer with no rate
  // row earned nothing, and the payouts page showed a settled case as 0 with nothing flagging it.
  rate: number
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

// Cursor-paged since contract gate 12 (the mock still returns the plain array). The only consumer
// is the share editor, which must find THIS freelancer's rate row to decide create vs update — a
// row on page two would otherwise read as "no rate" and POST a duplicate — so it walks every page
// (100 rows a request) rather than showing one screenful.
export function useFreelancerRates() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['freelancer-rates'],
    queryFn: async () => {
      return fetchAllPages<components['schemas']['FreelancerRate']>(async (cursor) => {
        const { data, error } = await api.GET('/freelancer-rates', { params: { query: { cursor, limit: 100 } } })
        if (error) throw new ApiError('Could not load freelancer rates.', error)
        const page = toPage(data)
        return { items: page.items, meta: page.meta ?? {} }
      })
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
