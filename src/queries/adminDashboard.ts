import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useAdminDashboard() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/dashboard')
      if (error) throw new ApiError('Could not load the dashboard.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/**
 * The Needs attention list and its total (2026-09-10). Read by the page AND by the console's
 * sidebar counter on every page, so it re-checks every minute and whenever the tab regains focus —
 * a counter that only moves on a full reload would say "all clear" long after it stopped being true.
 */
export function useAdminAttention() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-attention'],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/attention')
      if (error) throw new ApiError('Could not load what needs attention.', error)
      return data
    },
    enabled: isAuthed,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}
