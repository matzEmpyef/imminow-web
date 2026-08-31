import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type NotificationSettings = components['schemas']['NotificationSettings']

export function useNotifications(options?: { enabled?: boolean }) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await api.GET('/notifications')
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
    queryFn: async () => {
      const { data, error } = await api.GET('/notifications/unread-count')
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

export function useNotificationSettings() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const { data, error } = await api.GET('/notification-settings')
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
