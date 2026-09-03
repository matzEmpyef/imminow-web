import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// Two directories, never one — the Sentpo (student) and immiNow (console) populations are never
// blended, matching docs/PROGRESS.md §4 Step 3 and the server's own "never blend the two
// populations" rule for analytics events.

export interface SentpoUserDirectoryFilters {
  search?: string
  stage?: 1 | 2
  /** never_logged_in | stuck | onboarded, or `pending` for both not-onboarded states. */
  onboarding?: string
  dormant_days?: number
  /** android | ios | web | unknown — the app the student last opened (2026-09-03). */
  platform?: string
  from?: string
  to?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useSentpoUserDirectory(filters: SentpoUserDirectoryFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-users-sentpo', filters],
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.stage) filter.stage = String(filters.stage)
      if (filters.onboarding) filter.onboarding = filters.onboarding
      if (filters.dormant_days) filter.dormant_days = String(filters.dormant_days)
      if (filters.platform) filter.platform = filters.platform
      if (filters.from) filter.from = filters.from
      if (filters.to) filter.to = filters.to

      const { data, error } = await api.GET('/admin/users/sentpo', {
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
      if (error) throw new ApiError('Could not load the Sentpo user directory.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export interface ImminowUserDirectoryFilters {
  search?: string
  consultancy_id?: string
  active?: boolean
  never_active?: boolean
  sort?: string
  cursor?: string
  limit?: number
}

export function useImminowUserDirectory(filters: ImminowUserDirectoryFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-users-imminow', filters],
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.consultancy_id) filter.consultancy_id = filters.consultancy_id
      if (filters.active !== undefined) filter.active = String(filters.active)
      if (filters.never_active) filter.never_active = 'true'

      const { data, error } = await api.GET('/admin/users/imminow', {
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
      if (error) throw new ApiError('Could not load the immiNow user directory.', error)
      return data
    },
    enabled: isAuthed,
  })
}
