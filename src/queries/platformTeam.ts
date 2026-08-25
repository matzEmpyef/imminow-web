import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function usePlatformStaff() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['platform-staff'],
    queryFn: async () => {
      const { data, error } = await api.GET('/platform-staff')
      if (error) throw new ApiError('Could not load platform staff.')
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreatePlatformStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; email: string; permissions?: Record<string, boolean> }) => {
      const { data, error } = await api.POST('/platform-staff', { body })
      if (error) throw new ApiError('Could not create this account.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-staff'] }),
  })
}

export function useUpdatePlatformStaffPermissions(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, boolean>) => {
      const { data, error } = await api.PATCH('/platform-staff/{id}/permissions', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update permissions.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-staff'] }),
  })
}

export function useDisablePlatformStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/platform-staff/{id}', { params: { path: { id } } })
      if (error) throw new ApiError(error.error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-staff'] }),
  })
}
