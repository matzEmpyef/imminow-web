import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export interface AuditLogFilters {
  entity_id?: string
  actor_id?: string
  action_type?: 'create' | 'update' | 'delete'
  area?: 'leads' | 'clients' | 'plans' | 'documents' | 'settings' | 'staff'
  from?: string
  to?: string
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useAuditLog(filters: AuditLogFilters) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['audit-log', filters],
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.entity_id) filter.entity_id = filters.entity_id
      if (filters.actor_id) filter.actor_id = filters.actor_id
      if (filters.action_type) filter.action_type = filters.action_type
      if (filters.area) filter.area = filters.area
      if (filters.from) filter.from = filters.from
      if (filters.to) filter.to = filters.to

      const { data, error, response } = await api.GET('/audit-log', {
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
      // The status goes with it: a 403 is "not yours to read", which the page says plainly rather
      // than showing a failure to load (review F-021). Read before the check below: the contract
      // lists no error answer for this route, so inside it the response has no type left to read.
      const status = response.status
      if (error) throw new ApiError('Could not load the audit log.', error, status)
      return data
    },
    enabled: isAuthed,
  })
}
