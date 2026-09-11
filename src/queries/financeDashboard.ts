import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
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
export type CommissionDuePart = components['schemas']['CommissionDuePart']
export type CommissionDueChange = components['schemas']['CommissionDueChange']

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
  /** configured | fallback_default — Commission Rates' "Cases priced at the default" tile links here with fallback_default (2026-09-11). */
  rate_source?: 'configured' | 'fallback_default'
  /** A dated due part is past its date and unpaid (2026-09-11) — Cases' "Overdue" quick filter and the Overview tile both land here. */
  overdue?: boolean
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
  if (filters.rate_source) filter.rate_source = filters.rate_source
  if (filters.overdue) filter.overdue = 'true'
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

// Every case-due mutation (add/correct/void, 2026-09-11) invalidates the same three prefixes: the
// finance views (cases/summary/balances all read from FinanceCaseRow figures), the consultancy's
// own `/commission` read (due_schedule/overdue_inr are mirrored there), and the case follow-ups
// queue (a payment_overdue signal can appear or clear as a result).
function invalidateFinanceCaseViews(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
  queryClient.invalidateQueries({ queryKey: ['commission'] })
  queryClient.invalidateQueries({ queryKey: ['case-followups'] })
}

// Adds an amount a case owes immiNow — a second instalment, an agreed extra (finance permission,
// 2026-09-11). In the amount's own currency (defaults to the case's own on the server when
// omitted). Returns the updated FinanceCaseRow so FinanceCaseDrawer can refresh itself directly
// rather than waiting on a refetch.
export function useAddCommissionDue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      entryId,
      amount,
      currency,
      due_on,
      reason,
    }: {
      entryId: string
      amount: number
      currency?: string
      due_on?: string | null
      reason: string
    }) => {
      const { data, error } = await api.POST('/commission-entries/{id}/dues', {
        params: { path: { id: entryId } },
        body: { amount, currency, due_on, reason },
      })
      if (error) throw new ApiError('Could not add this due amount.', error)
      return data
    },
    onSuccess: () => invalidateFinanceCaseViews(queryClient),
  })
}

// Overrides immiNow's calculated share on a case with an amount in a currency, optionally with
// its own due date (finance permission, 2026-09-11) — replaces useCorrectOriginalDue now that the
// calculated share can be in more than one currency. `clear: true` removes the override and goes
// back to the calculation (409 when there is none). The calculated figure stays on record as
// calculated_due_inr regardless of an override.
export function useOverrideCommissionDue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      entryId,
      amount,
      currency,
      due_on,
      clear,
      reason,
    }: {
      entryId: string
      amount?: number
      currency?: string
      due_on?: string | null
      clear?: boolean
      reason: string
    }) => {
      const { data, error } = await api.PATCH('/commission-entries/{id}/original-due', {
        params: { path: { id: entryId } },
        body: { amount, currency, due_on, clear, reason },
      })
      if (error) throw new ApiError('Could not change the calculated share.', error)
      return data
    },
    onSuccess: () => invalidateFinanceCaseViews(queryClient),
  })
}

// Removes an amount added by mistake (finance permission) — only ever an `added` part; the
// original amount is corrected via useCorrectOriginalDue instead. Stays in due_changes, marked
// removed, not deleted. Reopening a waived (closed-without-payment) part reuses this same
// mutation with changeId = part.waive_change_id — a waive is just another change that can be
// voided (ReopenDueModal).
export function useVoidCommissionDue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ entryId, changeId, reason }: { entryId: string; changeId: string; reason: string }) => {
      const { data, error } = await api.POST('/commission-entries/{id}/dues/{changeId}/void', {
        params: { path: { id: entryId, changeId } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not remove this due amount.', error)
      return data
    },
    onSuccess: () => invalidateFinanceCaseViews(queryClient),
  })
}

// Finance marks money as received directly on a case — a confirmed payment recorded with no
// declaration from the consultancy needed; they're only notified after the fact (finance
// permission, 2026-09-11). With `part_key` it settles that part first (409 if that part is
// already closed without payment); without one it's money not tied to any single part.
export function useReceiveCommissionDue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      entryId,
      amount,
      currency,
      part_key,
      received_on,
      reference,
      note,
    }: {
      entryId: string
      amount: number
      currency?: string
      part_key?: string
      received_on?: string
      reference?: string
      note?: string
    }) => {
      const { data, error } = await api.POST('/commission-entries/{id}/receive', {
        params: { path: { id: entryId } },
        body: { amount, currency, part_key, received_on, reference, note },
      })
      if (error) throw new ApiError('Could not record this payment.', error)
      return data
    },
    onSuccess: () => invalidateFinanceCaseViews(queryClient),
  })
}

// Closes a due part without payment, with a reason the consultancy is shown (finance permission,
// 2026-09-11). It stops counting as outstanding or overdue; 409 when the part isn't due yet,
// already paid, or already closed. Reopen it with useVoidCommissionDue against the returned
// waive_change_id.
export function useWaiveCommissionDue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ entryId, part_key, reason }: { entryId: string; part_key: string; reason: string }) => {
      const { data, error } = await api.POST('/commission-entries/{id}/waive', {
        params: { path: { id: entryId } },
        body: { part_key, reason },
      })
      if (error) throw new ApiError('Could not close this part.', error)
      return data
    },
    onSuccess: () => invalidateFinanceCaseViews(queryClient),
  })
}
