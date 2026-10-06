import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type NotificationSettings = components['schemas']['NotificationSettings']

export interface NotificationsFilters {
  /** `undefined` = both; `true`/`false` narrows to unread/read only. */
  read?: boolean
  search?: string
  cursor?: string
  limit?: number
}

/**
 * The in-app inbox (contract gate 9, item 2 documents `filter[read]`, `filter[type]`, `search` —
 * the mock already accepted all three pre-gate-9, so this was always safe to send). `filter[type]`
 * isn't exposed here — the console has no per-type picker today, same scope the plan's "web
 * Notifications page" item asks for (search + read/unread + cursor paging + read-all).
 */
export function useNotifications(filters: NotificationsFilters = {}, options?: { enabled?: boolean }) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const { read, search, cursor, limit } = filters
  return useQuery({
    queryKey: ['notifications', { read, search, cursor, limit }],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/notifications', {
        signal,
        params: {
          query: {
            ...(read !== undefined ? { 'filter[read]': read } : {}),
            ...(search ? { search } : {}),
            ...(cursor ? { cursor } : {}),
            ...(limit ? { limit } : {}),
          },
        },
      })
      if (error) throw new ApiError('Could not load notifications.', error)
      return data
    },
    enabled: isAuthed && (options?.enabled ?? true),
  })
}

/**
 * The bell badge's own number, fetched independently of the inbox list (2026-08-31). Nothing but
 * the count is needed to render a badge, and `GET /notifications` is now paginated — asking it for
 * a page of rows just to read `unread_count` off the envelope means paying for twenty rows the
 * badge never renders. `GET /notifications/unread-count` returns the same figure alone.
 */
export function useUnreadCount() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/notifications/unread-count', { signal })
      if (error) throw new ApiError('Could not load unread count.', error)
      return data.unread_count
    },
    enabled: isAuthed,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST('/notifications/{id}/read', { params: { path: { id } } })
      if (error) throw new ApiError('Could not mark notification as read.', error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })
}

/**
 * Mark-all-read (contract gate 9, K10) — `POST /notifications/read-all`. The mock (frozen
 * post-Wave-3) doesn't implement this route yet and answers 404; no mock-only fallback lives
 * here (docs/CLAUDE.md: `mock-server/` is temporary, nothing client-side should special-case it)
 * — a failure just surfaces as the caller's normal error toast, rows unchanged, same as any other
 * mutation.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/notifications/read-all')
      if (error) throw new ApiError('Could not mark all as read.', error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })
}

export function useNotificationSettings() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['notification-settings'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/notification-settings', { signal })
      if (error) throw new ApiError('Could not load notification settings.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: NotificationSettings) => {
      const { data, error } = await api.PATCH('/notification-settings', { body })
      if (error) throw new ApiError('Could not update notification settings.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-settings'] }),
  })
}
