import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

/** Every area an entry can carry (the contract's `AuditLogEntry.area`), so the Area filter can reach them all. */
export type AuditArea = components['schemas']['AuditLogEntry']['area']

// A Record, not an array: when the contract adds an area this stops compiling until it is listed
// here, instead of the filter silently missing it (review F-304).
const AUDIT_AREA_SET: Record<AuditArea, true> = {
  leads: true,
  clients: true,
  plans: true,
  documents: true,
  settings: true,
  staff: true,
  marketing: true,
  support: true,
  finance: true,
  consultancy_management: true,
  catalog: true,
  app_config: true,
  consultancies: true,
  billing: true,
  moderation: true,
  freelancers: true,
  analytics: true,
  ads: true,
  jobs: true,
  notifications: true,
}
export const AUDIT_AREAS = Object.keys(AUDIT_AREA_SET) as AuditArea[]

/**
 * The areas a consultancy or an institute can produce (T4-24). The rest belong to the platform's
 * own staff (marketing, support, finance, the catalogue, app settings, billing, moderation,
 * freelancers, analytics, ads, jobs, notifications), so a consultancy's Area filter does not
 * offer them: choosing one could only ever show an empty page.
 */
export const CONSULTANCY_AUDIT_AREAS: AuditArea[] = [
  'leads',
  'clients',
  'plans',
  'documents',
  'settings',
  'staff',
  'consultancy_management',
]

export interface AuditLogFilters {
  entity_id?: string
  actor_id?: string
  action_type?: 'create' | 'update' | 'delete'
  area?: AuditArea
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
    queryFn: async ({ signal }) => {
      const filter: Record<string, string> = {}
      if (filters.entity_id) filter.entity_id = filters.entity_id
      if (filters.actor_id) filter.actor_id = filters.actor_id
      if (filters.action_type) filter.action_type = filters.action_type
      if (filters.area) filter.area = filters.area
      if (filters.from) filter.from = filters.from
      if (filters.to) filter.to = filters.to

      const { data, error, response } = await api.GET('/audit-log', {
        signal,
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
