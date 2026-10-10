import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { editError, reloadOnStaleEdit, requireVersion } from '@/lib/staleEdit'
import type { components } from '@/api/schema'

type EventInput = components['schemas']['EventInput']
type EventType = 'quiz' | 'webinar' | 'physical_meeting'
type EventWhen = 'upcoming' | 'live' | 'past'

export interface AdminEventsFilters {
  type?: EventType
  /** Upcoming / Past tabs (2026-09-11 server change — GET /events became cursor-paginated). */
  when?: EventWhen
  search?: string
  /** `field` or `-field` — the server only sorts /events by `starts_at`/`title`. */
  sort?: string
  cursor?: string
  limit?: number
}

// `type` made optional (2026-08-18) — Ads Manager's event picker needs every event type in one
// list to search across; the backend already supports omitting `type` to return all of them
// (mock-server's GET /events only filters when the query param is present), so this was just a
// signature change, not a new capability.
//
// Extended (2026-09-11) to also take the fuller `AdminEventsFilters` the Upcoming/Past tabs need
// (`when`, `search`, cursor pagination) — the bare `type` shorthand keeps working unchanged for
// every existing caller (AdsManagerPage, BroadcastPage, and the three event pages' old call sites).
// Callers that don't ask for a specific page size get `limit: 100` rather than the server's
// default 20 — GET /events itself became cursor-paginated in the same change, and a caller using
// the bare-`type` shorthand is almost always a picker (Ads/Broadcast's event search-select) that
// wants "effectively everything", not a 20-item first page.
export function useAdminEvents(filters?: EventType | AdminEventsFilters) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const normalized: AdminEventsFilters = typeof filters === 'string' ? { type: filters } : (filters ?? {})
  return useQuery({
    queryKey: ['admin-events', normalized],
    queryFn: async ({ signal }) => {
      const query = {
        type: normalized.type,
        when: normalized.when,
        cursor: normalized.cursor,
        limit: normalized.limit ?? 100,
        search: normalized.search,
        sort: normalized.sort,
      }
      const { data, error } = await api.GET('/events', { signal, params: { query } })
      if (error) throw new ApiError('Could not load events.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreateEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: EventInput) => {
      const { data, error } = await api.POST('/events', { body })
      if (error) throw new ApiError('Could not create this event.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-events'] }),
  })
}

// `version` is the event's version as last read (review I-029; on the contract since 2026-10-08),
// sent back on every edit exactly as an ad's is: the quiz, webinar and meeting forms, a quiz's
// questions and branding, and the listed / unlisted switch. When someone else saved the event
// first the server answers 409 `version_conflict` and writes nothing; the list is read again and
// the form keeps what was entered, so the next save carries the current version.
export function useUpdateEvent(id: string, version?: number) {
  const queryClient = useQueryClient()
  return useMutation({
    // `listed` (2026-09-04): false unlists the event for students, true restores it — a PATCH-only
    // field, so it sits beside EventInput rather than inside it.
    mutationFn: async (body: Partial<EventInput> & { listed?: boolean }) => {
      const { data, error } = await api.PATCH('/events/{id}', {
        params: { path: { id } },
        body: { ...body, version: requireVersion(version) },
      })
      if (error) throw editError('Could not update this event.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-events'] }),
    onError: (err) => reloadOnStaleEdit(err, () => queryClient.invalidateQueries({ queryKey: ['admin-events'] })),
  })
}

export function useVoidEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/events/{id}/void', { params: { path: { id } } })
      if (error) throw new ApiError('Could not void this event.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-events'] }),
  })
}

export function useEventAttendance(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['event-attendance', id],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/events/{id}/attendance', { signal, params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load RSVPs/attendance.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}

// User-requested (2026-08-17) — "where do I see how many people participated and their details
// as well as leader board." Lazily fetched only once the participant count is actually clicked,
// same `enabled` pattern as useEventAttendance above.
/** How often an open leaderboard is read again while its standings are still provisional. */
export const LIVE_STANDINGS_POLL_MS = 30_000

export function useQuizLeaderboard(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['quiz-leaderboard', id],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/events/{id}/leaderboard', { signal, params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load the leaderboard.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
    // Live standings (owner, 2026-10-06): until the server says the results are final, more
    // attempts can still come in and ranks can move, so the open popup asks again now and then.
    // Whether they are final is read from the answer (`results_final`), never from the clock.
    refetchInterval: (query) => (query.state.data && !query.state.data.results_final ? LIVE_STANDINGS_POLL_MS : false),
  })
}
