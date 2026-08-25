import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type NotificationSettings = components['schemas']['NotificationSettings']

export function useNotifications() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await api.GET('/notifications')
      if (error) throw new ApiError('Could not load notifications.')
      return data
    },
    enabled: isAuthed,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST('/notifications/{id}/read', { params: { path: { id } } })
      if (error) throw new ApiError('Could not mark notification as read.')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useNotificationSettings() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const { data, error } = await api.GET('/notification-settings')
      if (error) throw new ApiError('Could not load notification settings.')
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
      if (error) throw new ApiError('Could not update notification settings.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-settings'] }),
  })
}
