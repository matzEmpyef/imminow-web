import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

interface ProfileEdits {
  first_name?: string
  last_name?: string
  phone?: string | null
}

export function useProfile() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data, error } = await api.GET('/profile')
      if (error) throw new ApiError('Could not load your profile.')
      return data
    },
    enabled: isAuthed,
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  return useMutation({
    mutationFn: async (body: ProfileEdits) => {
      const { data, error } = await api.PATCH('/profile', { body })
      if (error) throw new ApiError('Could not update your profile.')
      return data
    },
    onSuccess: (data) => {
      if (data) setUser(data)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: { current_password: string; new_password: string }) => {
      const { error } = await api.POST('/profile/change-password', { body })
      if (error) throw new ApiError('Current password is incorrect.')
    },
  })
}
