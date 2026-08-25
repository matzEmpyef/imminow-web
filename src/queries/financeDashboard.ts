import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export interface FinanceDashboardFilters {
  consultancy_id?: string
  from?: string
  to?: string
  destination_country?: string
  payer_method?: 'college' | 'applicant' | 'split'
}

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
