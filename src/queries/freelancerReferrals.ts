import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type FreelancerReferral = components['schemas']['FreelancerReferral']
export type FreelancerPayout = components['schemas']['FreelancerPayout']

/** The logged-in freelancer's own referrals — tracking only, no case management, no chat. */
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

/** The logged-in freelancer's own referral identity — code + ready-to-share URL. */
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

export interface FreelancerReferralsAdminFilters {
  search?: string
  /** not_due | owed | paid, comma-joined for "any of". */
  payout_status?: string
  freelancer_id?: string
  sort?: string
  cursor?: string
  limit?: number
}

function freelancerReferralsFilter(filters: FreelancerReferralsAdminFilters): Record<string, string> {
  const filter: Record<string, string> = {}
  if (filters.payout_status) filter.payout_status = filters.payout_status
  if (filters.freelancer_id) filter.freelancer_id = filters.freelancer_id
  return filter
}

/**
 * Super Admin payout ledger (2026-09-11 rebuild) — every freelancer referral platform-wide, with
 * what each has earned/been paid/is owed, server-paged. Backs both the Owed and Not yet due tabs
 * on Freelancer Payouts, and the "referrals" list in a freelancer's own drawer (filtered to one
 * freelancer_id, unpaged there since it's a small compact list).
 */
export function useFreelancerReferralsAdmin(
  filters: FreelancerReferralsAdminFilters = {},
  options?: { enabled?: boolean },
) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['freelancer-referrals-admin', filters],
    queryFn: async () => {
      const filter = freelancerReferralsFilter(filters)
      const { data, error } = await api.GET('/freelancer-referrals', {
        params: {
          query: {
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load freelancer referrals.', error)
      return data
    },
    enabled: isAuthed && (options?.enabled ?? true),
  })
}

export interface RecordPayoutInput {
  referralId: string
  amount_inr: number
  paid_on: string
  reference?: string
}

/**
 * Records a payout against one referral (2026-09-11) — the money moves outside the platform; this
 * only records that it happened. 409 if the amount exceeds what's owed, or nothing is owed at all
 * (e.g. someone else just recorded it in another tab).
 */
export function useRecordFreelancerPayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ referralId, ...body }: RecordPayoutInput) => {
      const { data, error } = await api.POST('/freelancer-referrals/{id}/payouts', {
        params: { path: { id: referralId } },
        body,
      })
      if (error) throw new ApiError('Could not record this payout.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freelancer-referrals-admin'] })
      queryClient.invalidateQueries({ queryKey: ['freelancer-payouts-admin'] })
      queryClient.invalidateQueries({ queryKey: ['freelancers'] })
    },
  })
}

export interface FreelancerPayoutsFilters {
  search?: string
  freelancer_id?: string
  from?: string
  to?: string
  voided?: boolean
  sort?: string
  cursor?: string
  limit?: number
}

function freelancerPayoutsFilter(filters: FreelancerPayoutsFilters): Record<string, string> {
  const filter: Record<string, string> = {}
  if (filters.freelancer_id) filter.freelancer_id = filters.freelancer_id
  if (filters.from) filter.from = filters.from
  if (filters.to) filter.to = filters.to
  if (filters.voided !== undefined) filter.voided = String(filters.voided)
  return filter
}

/** Paid & history tab — every payout ever recorded, voided ones included only via the "Show undone" chip. */
export function useFreelancerPayouts(filters: FreelancerPayoutsFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['freelancer-payouts-admin', filters],
    queryFn: async () => {
      const filter = freelancerPayoutsFilter(filters)
      const { data, error } = await api.GET('/freelancer-payouts', {
        params: {
          query: {
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load payout history.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// "Download CSV" needs every page for the current filters, not just the one on screen — same
// pattern as fetchAllFinancePayments (queries/financeDashboard.ts).
export async function fetchAllFreelancerPayouts(
  filters: Omit<FreelancerPayoutsFilters, 'cursor' | 'limit'>,
): Promise<FreelancerPayout[]> {
  const items: FreelancerPayout[] = []
  let cursor: string | undefined
  const filter = freelancerPayoutsFilter(filters)
  for (;;) {
    const { data, error } = await api.GET('/freelancer-payouts', {
      params: {
        query: {
          filter: Object.keys(filter).length > 0 ? filter : undefined,
          search: filters.search,
          sort: filters.sort,
          cursor,
          limit: 100,
        },
      },
    })
    if (error) throw new ApiError('Could not export payout history.', error)
    items.push(...(data?.items ?? []))
    if (!data?.meta.next_cursor) break
    cursor = data.meta.next_cursor
  }
  return items
}

/** Undoes a recorded payout with a reason; the amount becomes owed again. 409 if already undone. */
export function useVoidFreelancerPayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/freelancer-payouts/{id}/void', {
        params: { path: { id } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not undo this payout.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freelancer-payouts-admin'] })
      queryClient.invalidateQueries({ queryKey: ['freelancer-referrals-admin'] })
      queryClient.invalidateQueries({ queryKey: ['freelancers'] })
    },
  })
}
