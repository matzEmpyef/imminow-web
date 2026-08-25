import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

type Scope = 'personal' | 'branch' | 'consultancy'

export function useDashboard(scope: Scope) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['dashboard', scope],
    queryFn: async () => {
      const { data, error } = await api.GET('/dashboard', { params: { query: { scope } } })
      if (error) throw new ApiError('Could not load the dashboard.')
      return data
    },
    enabled: isAuthed,
  })
}
