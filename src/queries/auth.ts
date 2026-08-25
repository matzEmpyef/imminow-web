import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'

export class ApiError extends Error {}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const { data, error } = await api.POST('/auth/login', { body })
      if (error) throw new ApiError(error.error.message)
      return data
    },
    onSuccess: (data) => setSession(data),
  })
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (body: { email: string }) => {
      // Always 202 per contract — account existence is never disclosed, so there's no error
      // branch to distinguish here (build reference 2.2).
      await api.POST('/auth/forgot-password', { body })
    },
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (body: { token: string; new_password: string }) => {
      const { error } = await api.POST('/auth/reset-password', { body })
      if (error) throw new ApiError(error.error.message)
    },
  })
}

export function useInvite(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: async () => {
      const { data, error } = await api.GET('/auth/invite/{token}', { params: { path: { token } } })
      if (error) throw new ApiError(error.error.message)
      return data
    },
    retry: false,
  })
}

export function useAcceptInvite(token: string) {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: async (body: { password: string }) => {
      const { data, error } = await api.POST('/auth/invite/{token}', {
        params: { path: { token } },
        body,
      })
      if (error) throw new ApiError(error.error.message)
      return data
    },
    onSuccess: (data) => setSession(data),
  })
}
