import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// docs/PROGRESS.md §4 Step 4 — gated to any platform account (requirePlatformAccount server-side),
// same as the landing Platform Dashboard, not one specific permission flag.
export function useSupplyDemand() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-supply-demand'],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/supply-demand')
      if (error) throw new ApiError('Could not load supply/demand data.', error)
      return data
    },
    enabled: isAuthed,
  })
}
