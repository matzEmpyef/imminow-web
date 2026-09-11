import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type CommissionRateInput = components['schemas']['CommissionRateInput']
type CommissionRateBulkGroup = components['schemas']['CommissionRateBulkGroup']
export type CommissionRateCoverageRow = components['schemas']['CommissionRateCoverageRow']
export type CommissionDefaults = components['schemas']['CommissionDefaults']

// `options.enabled` (2026-09-11 addition, default true — every existing call site keeps fetching
// exactly as before) lets a caller skip the request entirely rather than it falling through to
// "every rate on the platform" — which is what `consultancyId` undefined does here — while a form
// has no consultancy picked yet. The rebuilt Commission Rates page's rate editor is the first
// caller that needs this: fetching all rates just because nothing is selected yet was the same
// browser-side-everything pattern the rebuild replaced.
export function useCommissionRates(consultancyId?: string, options?: { enabled?: boolean }) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['commission-rates', consultancyId],
    queryFn: async () => {
      const { data, error } = await api.GET('/commission-rates', {
        params: { query: consultancyId ? { consultancy_id: consultancyId } : {} },
      })
      if (error) throw new ApiError('Could not load commission rates.', error)
      return data
    },
    enabled: isAuthed && (options?.enabled ?? true),
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
      if (error) throw new ApiError('Could not load your commission rates.', error)
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
      if (error) throw new ApiError('Could not create this rate.', error)
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
      if (error) throw new ApiError('Could not update this rate.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commission-rates'] }),
  })
}

// The one-shot rate matrix (user decision, 2026-08-28 — "should be able to add these 8 rates
// manually, should not have to click add for each type... no need of add rows"): upserts all
// four payer rows for a (consultancy, destination_country) pair in a single call, whether that
// country already has some rates configured or none at all.
export function useBulkSetCommissionRates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      consultancy_id: string
      destination_country: string
      rates: {
        applicant: CommissionRateBulkGroup
        college: CommissionRateBulkGroup
        split: CommissionRateBulkGroup
        pr: CommissionRateBulkGroup
      }
    }) => {
      const { data, error } = await api.PUT('/commission-rates/bulk', { body })
      if (error) throw new ApiError('Could not save this rate matrix.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commission-rates'] }),
  })
}

// The default platform cut applied when no CommissionRate row covers a case (2026-09-11 rebuild —
// the old page never showed this fallback existed at all, so a gap in coverage silently priced
// cases at a number nobody could see).
export function useCommissionDefaults() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['commission-rates', 'defaults'],
    queryFn: async () => {
      const { data, error } = await api.GET('/commission-rates/defaults')
      if (error) throw new ApiError('Could not load the default commission rates.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// Prices cases accepted from now on; audited server-side. Invalidates the coverage list too, since
// its `default_percent` per row and `default_rate_cases` summary both derive from this value.
export function useUpdateCommissionDefaults() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { consultancy_percent?: number; institute_percent?: number }) => {
      const { data, error } = await api.PUT('/commission-rates/defaults', { body })
      if (error) throw new ApiError('Could not save the default commission rates.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rates', 'defaults'] })
      queryClient.invalidateQueries({ queryKey: ['commission-rates', 'coverage'] })
    },
  })
}

export interface CommissionCoverageFilters {
  search?: string
  kind?: 'consultancy' | 'institute'
  /** Comma-joined for "any of" — e.g. the Commission Rates page's "Accounts with gaps" tile passes 'partial,missing'. */
  coverage?: string
  freelancer?: boolean
  sort?: string
  cursor?: string
  limit?: number
}

// Per-account rate coverage, paged (2026-09-11 rebuild). Replaces the old page's approach of
// loading the first 100 consultancies plus every rate row and counting them in the browser — which
// hid gaps entirely: a consultancy serving 5 countries with 3 half-set looked "done" (its
// "Rates Configured" count was just "how many countries have ANY rate"), and every uncovered
// country silently priced cases at the invisible default. The server now does that counting once,
// against every account, and returns complete/partial/missing per country plus a summary.
export function useCommissionRatesCoverage(filters: CommissionCoverageFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['commission-rates', 'coverage', filters],
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.kind) filter.kind = filters.kind
      if (filters.coverage) filter.coverage = filters.coverage
      if (filters.freelancer !== undefined) filter.freelancer = String(filters.freelancer)
      const { data, error } = await api.GET('/commission-rates/coverage', {
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
      if (error) throw new ApiError('Could not load commission rate coverage.', error)
      return data
    },
    enabled: isAuthed,
  })
}
