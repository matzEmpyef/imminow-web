import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useUserSearch(q: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['user-search', q],
    queryFn: async () => {
      const { data, error } = await api.GET('/users/search', { params: { query: { q } } })
      if (error) throw new ApiError('Could not search users.', error)
      return data
    },
    enabled: isAuthed && q.trim().length > 0,
  })
}

export function useExportUserData() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/users/{id}/export', { params: { path: { id } } })
      if (error) throw new ApiError('Could not generate a data export.', error)
      return data
    },
  })
}

export function useUpdateUserEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, new_email, reason }: { id: string; new_email: string; reason: string }) => {
      const { data, error } = await api.POST('/users/{id}/email', {
        params: { path: { id } },
        body: { new_email, reason },
      })
      if (error) throw new ApiError('Could not update this email.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-search'] }),
  })
}

export function useEraseUserData() {
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/users/{id}/erase', { params: { path: { id } }, body: { reason } })
      if (error) throw new ApiError(error.error.message)
      return data
    },
  })
}

export function useSwitchConsultancy() {
  return useMutation({
    mutationFn: async ({
      journeyId,
      new_consultancy_id,
      reason,
    }: {
      journeyId: string
      new_consultancy_id: string
      reason: string
    }) => {
      const { data, error } = await api.POST('/journeys/{id}/switch-consultancy', {
        params: { path: { id: journeyId } },
        body: { new_consultancy_id, reason },
      })
      if (error) throw new ApiError('Could not switch this student to a new consultancy.', error)
      return data
    },
  })
}
