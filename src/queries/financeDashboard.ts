import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export interface FinanceDashboardFilters {
  consultancy_id?: string
  from?: string
  to?: string
  destination_country?: string
  payer_method?: 'college' | 'applicant' | 'split'
}

// Kept working (other code may still import it) even though FinanceDashboardPage itself moved to
// the paged /commission/finance/* endpoints below (2026-09-11) — the old /commission/finance-
// dashboard endpoint loaded every case and every payment in one response, which does not scale to
// hundreds of payments.
export function useFinanceDashboard(filters: FinanceDashboardFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['finance-dashboard', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/commission/finance-dashboard', { params: { query: filters } })
      if (error) throw new ApiError('Could not load the finance dashboard.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// Shared key prefix (2026-09-11) — every finance mutation (confirm, reject) invalidates this whole
// prefix so the summary tiles, chart, balances, cases and payments tables all pick up the change
// in one call rather than each mutation having to know every finance query key by hand.
export const FINANCE_QUERY_KEY = 'finance'

export type FinanceSummary = components['schemas']['FinanceSummary']
export type ConsultancyBalanceRow = components['schemas']['ConsultancyBalanceRow']
export type FinanceCaseRow = components['schemas']['FinanceCaseRow']

export function useFinanceSummary() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: [FINANCE_QUERY_KEY, 'summary'],
    queryFn: async () => {
      const { data, error } = await api.GET('/commission/finance/summary')
      if (error) throw new ApiError('Could not load the finance summary.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export interface FinanceBalancesFilters {
  search?: string
  /** Only consultancies still owing (outstanding_inr > 0). */
  owing?: boolean
  sort?: string
  cursor?: string
  limit?: number
}

export function useFinanceBalances(filters: FinanceBalancesFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: [FINANCE_QUERY_KEY, 'balances', filters],
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.owing) filter.owing = 'true'
      const { data, error } = await api.GET('/commission/finance/balances', {
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
      if (error) throw new ApiError('Could not load consultancy balances.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export interface FinanceCasesFilters {
  search?: string
  consultancy_id?: string
  destination_country?: string
  payer_method?: 'college' | 'applicant' | 'split'
  payment_status?: 'unpaid' | 'part_paid' | 'paid'
  from?: string
  to?: string
  sort?: string
  cursor?: string
  limit?: number
}

function financeCasesFilter(filters: FinanceCasesFilters): Record<string, string> {
  const filter: Record<string, string> = {}
  if (filters.consultancy_id) filter.consultancy_id = filters.consultancy_id
  if (filters.destination_country) filter.destination_country = filters.destination_country
  if (filters.payer_method) filter.payer_method = filters.payer_method
  if (filters.payment_status) filter.payment_status = filters.payment_status
  if (filters.from) filter.from = filters.from
  if (filters.to) filter.to = filters.to
  return filter
}

export function useFinanceCases(filters: FinanceCasesFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: [FINANCE_QUERY_KEY, 'cases', filters],
    queryFn: async () => {
      const filter = financeCasesFilter(filters)
      const { data, error } = await api.GET('/commission/finance/cases', {
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
      if (error) throw new ApiError('Could not load commission cases.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export interface FinancePaymentsFilters {
  search?: string
  /** declared | confirmed | rejected — comma-joined for "any of". */
  status?: string
  consultancy_id?: string
  from?: string
  to?: string
  sort?: string
  cursor?: string
  limit?: number
}

function financePaymentsFilter(filters: FinancePaymentsFilters): Record<string, string> {
  const filter: Record<string, string> = {}
  if (filters.status) filter.status = filters.status
  if (filters.consultancy_id) filter.consultancy_id = filters.consultancy_id
  if (filters.from) filter.from = filters.from
  if (filters.to) filter.to = filters.to
  return filter
}

export function useFinancePayments(filters: FinancePaymentsFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: [FINANCE_QUERY_KEY, 'payments', filters],
    queryFn: async () => {
      const filter = financePaymentsFilter(filters)
      const { data, error } = await api.GET('/commission/finance/payments', {
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
      if (error) throw new ApiError('Could not load payment history.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// Payment History's "Download CSV" (2026-09-11) needs every page for the current filters, not just
// the one on screen — loops the cursor at the max page size outside of react-query, since this is a
// one-off export action rather than something the UI keeps subscribed to.
export async function fetchAllFinancePayments(
  filters: Omit<FinancePaymentsFilters, 'cursor' | 'limit'>,
): Promise<components['schemas']['CommissionPayment'][]> {
  const items: components['schemas']['CommissionPayment'][] = []
  let cursor: string | undefined
  const filter = financePaymentsFilter(filters)
  for (;;) {
    const { data, error } = await api.GET('/commission/finance/payments', {
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
    if (error) throw new ApiError('Could not export payment history.', error)
    items.push(...(data?.items ?? []))
    if (!data?.meta.next_cursor) break
    cursor = data.meta.next_cursor
  }
  return items
}
