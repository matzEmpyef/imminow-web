import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
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
    queryFn: async () => {
      const query = {
        type: normalized.type,
        when: normalized.when,
        cursor: normalized.cursor,
        limit: normalized.limit ?? 100,
        search: normalized.search,
        sort: normalized.sort,
      }
      const { data, error } = await api.GET('/events', { params: { query } })
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

export function useUpdateEvent(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    // `listed` (2026-09-04): false unlists the event for students, true restores it — a PATCH-only
    // field, so it sits beside EventInput rather than inside it.
    mutationFn: async (body: Partial<EventInput> & { listed?: boolean }) => {
      // Static message, not `error.error.message` — this PATCH's response schema only declares
      // 200, no error variant, so `error` types as `never` here (same reason every other
      // mutation hook in this codebase already throws a static string instead of reading a
      // message off `error`; this one just hadn't been brought in line yet).
      const { data, error } = await api.PATCH('/events/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this event.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-events'] }),
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
    queryFn: async () => {
      const { data, error } = await api.GET('/events/{id}/attendance', { params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load RSVPs/attendance.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}

// User-requested (2026-08-17) — "where do I see how many people participated and their details
// as well as leader board." Lazily fetched only once the participant count is actually clicked,
// same `enabled` pattern as useEventAttendance above.
export function useQuizLeaderboard(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['quiz-leaderboard', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/events/{id}/leaderboard', { params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load the leaderboard.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}
