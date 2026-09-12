import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type MarketingOverview = components['schemas']['MarketingOverview']

export type MarketingOverviewWindow = 7 | 30 | 90

// Marketing overview (Marketing review, 2026-09-11) — one page of numbers for Ads, Points & Coupons,
// Events, Jobs and Blog. Open to anyone holding any Marketing permission.
//
// `window_days` (review M19, 2026-09-12) — was fixed at 30 with no way to compare. The mock server
// already accepts 7/30/90 (see server.js), but this endpoint's `query` block in schema.d.ts hasn't
// been regenerated to type it — same "server ahead of the generated type" situation as
// adminConsultancies.ts's `status` widening, so the query object is cast at the call site.
export function useMarketingOverview(windowDays: MarketingOverviewWindow = 30) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['marketing-overview', windowDays],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/marketing/overview', {
        params: { query: { window_days: windowDays } } as never,
      })
      if (error) throw new ApiError('Could not load the Marketing overview.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 60 * 1000,
  })
}
