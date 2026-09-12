import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

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
  /** under_50 | 50_to_99 | complete — profile completion (2026-09-11). */
  profile?: string
  from?: string
  to?: string
  // Erased accounts are hidden by default (review M9, 2026-09-12) — they sat between live
  // students with nothing marking them. The server tells the two apart by email suffix rather
  // than a dedicated field (see isErasedRow below); this just asks it to include them.
  include_erased?: boolean
  sort?: string
  cursor?: string
  limit?: number
}

// `include_erased` isn't in the generated query type yet (schema.d.ts documents it in prose but
// the endpoint's `query` block predates the field being typed) — the whole query object is cast
// `as never` at each call site rather than waiting on a regen this session isn't doing, same
// situation as adminConsultancies.ts's `status` widening.
function sentpoDirectoryQuery(filters: Omit<SentpoUserDirectoryFilters, 'cursor' | 'limit'>): Record<string, unknown> {
  const filter: Record<string, string> = {}
  if (filters.stage) filter.stage = String(filters.stage)
  if (filters.onboarding) filter.onboarding = filters.onboarding
  if (filters.dormant_days) filter.dormant_days = String(filters.dormant_days)
  if (filters.platform) filter.platform = filters.platform
  if (filters.profile) filter.profile = filters.profile
  if (filters.from) filter.from = filters.from
  if (filters.to) filter.to = filters.to
  return {
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    search: filters.search,
    sort: filters.sort,
    include_erased: filters.include_erased || undefined,
  }
}

export function useSentpoUserDirectory(filters: SentpoUserDirectoryFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-users-sentpo', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/users/sentpo', {
        params: { query: { ...sentpoDirectoryQuery(filters), cursor: filters.cursor, limit: filters.limit } as never },
      })
      if (error) throw new ApiError('Could not load the Sentpo user directory.', error)
      return data
    },
    enabled: isAuthed,
  })
}

type SentpoUserDirectoryRow = components['schemas']['SentpoUserDirectoryRow']

/**
 * A row has no dedicated "erased" field (review M9) — the server marks an erased account by
 * rewriting its email to `...@deleted.example` (see `/users/{id}/erase` and the mock server's own
 * `/admin/users/sentpo` filter) rather than adding a column just for this list. Mirrors that
 * server-side check rather than inventing a separate rule the two could drift apart on.
 */
export function isErasedRow(row: Pick<SentpoUserDirectoryRow, 'email'>): boolean {
  return /@deleted\.example$/i.test(row.email ?? '')
}

/** Every page of the Sentpo directory for the current filters — the CSV export (review M9). */
export async function fetchAllSentpoUserDirectory(
  filters: Omit<SentpoUserDirectoryFilters, 'cursor' | 'limit'>,
): Promise<SentpoUserDirectoryRow[]> {
  const items: SentpoUserDirectoryRow[] = []
  let cursor: string | undefined
  const query = sentpoDirectoryQuery(filters)
  for (;;) {
    const { data, error } = await api.GET('/admin/users/sentpo', {
      params: { query: { ...query, cursor, limit: 100 } as never },
    })
    if (error) throw new ApiError('Could not export the Sentpo user directory.', error)
    items.push(...(data?.items ?? []))
    if (!data?.meta.next_cursor) break
    cursor = data.meta.next_cursor
  }
  return items
}

// One account's sign-in history (2026-09-10), for the drawer both directories open. The latest
// 50 attempts — enough for "why can't I get in" and "was that me"; the drawer says when more exist.
export const SIGN_IN_HISTORY_LIMIT = 50

export function useUserSignIns(userId: string | null) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-user-sign-ins', userId],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/users/{id}/sign-ins', {
        params: { path: { id: userId ?? '' }, query: { limit: SIGN_IN_HISTORY_LIMIT } },
      })
      if (error) throw new ApiError('Could not load sign-in history.', error)
      return data
    },
    enabled: isAuthed && Boolean(userId),
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

function imminowDirectoryQuery(filters: Omit<ImminowUserDirectoryFilters, 'cursor' | 'limit'>) {
  const filter: Record<string, string> = {}
  if (filters.consultancy_id) filter.consultancy_id = filters.consultancy_id
  if (filters.active !== undefined) filter.active = String(filters.active)
  if (filters.never_active) filter.never_active = 'true'
  return {
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    search: filters.search,
    sort: filters.sort,
  }
}

export function useImminowUserDirectory(filters: ImminowUserDirectoryFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-users-imminow', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/users/imminow', {
        params: { query: { ...imminowDirectoryQuery(filters), cursor: filters.cursor, limit: filters.limit } },
      })
      if (error) throw new ApiError('Could not load the immiNow user directory.', error)
      return data
    },
    enabled: isAuthed,
  })
}

type ImminowUserDirectoryRow = components['schemas']['ImminowUserDirectoryRow']

/** Every page of the immiNow directory for the current filters — the CSV export (review M9). */
export async function fetchAllImminowUserDirectory(
  filters: Omit<ImminowUserDirectoryFilters, 'cursor' | 'limit'>,
): Promise<ImminowUserDirectoryRow[]> {
  const items: ImminowUserDirectoryRow[] = []
  let cursor: string | undefined
  const query = imminowDirectoryQuery(filters)
  for (;;) {
    const { data, error } = await api.GET('/admin/users/imminow', {
      params: { query: { ...query, cursor, limit: 100 } },
    })
    if (error) throw new ApiError('Could not export the immiNow user directory.', error)
    items.push(...(data?.items ?? []))
    if (!data?.meta.next_cursor) break
    cursor = data.meta.next_cursor
  }
  return items
}

/**
 * End every active session of one account (review M9, 2026-09-12) — the account itself is
 * untouched and can sign back in right away; this only clears its current sessions. 409 when the
 * target is another Super Admin.
 */
export function useSignOutEverywhere() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST('/admin/users/{id}/sign-out', { params: { path: { id } } })
      if (error) throw new ApiError('Could not sign this account out.', error)
    },
  })
}
