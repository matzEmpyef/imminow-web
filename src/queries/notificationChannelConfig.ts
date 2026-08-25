import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useNotificationChannelConfig() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['notification-channel-config'],
    queryFn: async () => {
      const { data, error } = await api.GET('/notification-channel-config')
      if (error) throw new ApiError('Could not load channel configuration.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useUpdateNotificationChannelConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { notification_type: string; push_enabled?: boolean; email_enabled?: boolean }) => {
      const { data, error } = await api.PATCH('/notification-channel-config', { body })
      if (error) throw new ApiError('Could not update this setting.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-channel-config'] }),
  })
}
