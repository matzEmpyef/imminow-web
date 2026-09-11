import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

// Derived from the generated schema rather than hand-written — this used to be a standalone
// union that fell out of step the moment `area` gained `consultancy_management` and `catalog`
// server-side (2026-09-11), silently rejecting those two values at the type level while the
// server happily returned rows carrying them.
export type PlatformAuditLogArea = components['schemas']['AuditLogEntry']['area']

export interface PlatformAuditLogFilters {
  consultancy_id?: string
  entity_id?: string
  actor_id?: string
  action_type?: 'create' | 'update' | 'delete'
  area?: PlatformAuditLogArea
  from?: string
  to?: string
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

function buildFilter(filters: Omit<PlatformAuditLogFilters, 'search' | 'sort' | 'cursor' | 'limit'>): Record<string, string> {
  const filter: Record<string, string> = {}
  if (filters.consultancy_id) filter.consultancy_id = filters.consultancy_id
  if (filters.entity_id) filter.entity_id = filters.entity_id
  if (filters.actor_id) filter.actor_id = filters.actor_id
  if (filters.action_type) filter.action_type = filters.action_type
  if (filters.area) filter.area = filters.area
  if (filters.from) filter.from = filters.from
  if (filters.to) filter.to = filters.to
  return filter
}

export function usePlatformAuditLog(filters: PlatformAuditLogFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['platform-audit-log', filters],
    queryFn: async () => {
      const filter = buildFilter(filters)
      const { data, error } = await api.GET('/audit-log/platform', {
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
      if (error) throw new ApiError('Could not load the audit log.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// Loops every page for the current filters at the server's max page size, for "Export CSV" — the
// table itself only ever renders one page at a time, and the export has to cover everything that
// matches, not just what's currently on screen (same shape as fetchAllFinancePayments).
export async function fetchAllPlatformAuditLog(
  filters: Omit<PlatformAuditLogFilters, 'cursor' | 'limit'>,
): Promise<components['schemas']['AuditLogEntry'][]> {
  const items: components['schemas']['AuditLogEntry'][] = []
  let cursor: string | undefined
  const filter = buildFilter(filters)
  for (;;) {
    const { data, error } = await api.GET('/audit-log/platform', {
      params: {
        query: {
          filter: Object.keys(filter).length > 0 ? filter : undefined,
          search: filters.search,
          sort: filters.sort,
          cursor,
          limit: 100,
        },
      },
    })
    if (error) throw new ApiError('Could not export the audit log.', error)
    items.push(...(data?.items ?? []))
    if (!data?.meta.next_cursor) break
    cursor = data.meta.next_cursor
  }
  return items
}
