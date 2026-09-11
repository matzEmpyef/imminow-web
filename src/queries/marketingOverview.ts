import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type MarketingOverview = components['schemas']['MarketingOverview']

// Marketing overview (Marketing review, 2026-09-11) — one page of numbers for Ads, Points & Coupons,
// Events, Jobs and Blog. Open to anyone holding any Marketing permission.
export function useMarketingOverview() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['marketing-overview'],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/marketing/overview')
      if (error) throw new ApiError('Could not load the Marketing overview.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 60 * 1000,
  })
}
