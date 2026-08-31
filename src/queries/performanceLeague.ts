import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// docs/PROGRESS.md §4 Step 4 — gated to consultancy_approval, the same flag that already gates
// Manage Consultancies and Applicant Allocation. Deliberately no composite score (recorded
// judgement): sortable columns plus `thresholds`-driven red-flag badges instead.
export function usePerformanceLeague() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-performance-league'],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/performance-league')
      if (error) throw new ApiError('Could not load the performance league.', error)
      return data
    },
    enabled: isAuthed,
  })
}
