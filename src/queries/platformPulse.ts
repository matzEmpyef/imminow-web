import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export type PlatformPulseWindow = 7 | 30 | 90

// docs/PROGRESS.md §4 (Platform Pulse, 2026-08-31) — gated to any platform account
// (requirePlatformAccount server-side), same broad gate as Supply & Demand and the landing
// Platform Dashboard, not one specific permission flag.
export function usePlatformPulse(windowDays: PlatformPulseWindow) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-platform-pulse', windowDays],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/platform-pulse', { params: { query: { window_days: windowDays } } })
      if (error) throw new ApiError('Could not load Platform Pulse data.', error)
      return data
    },
    enabled: isAuthed,
  })
}
