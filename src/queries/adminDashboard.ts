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
