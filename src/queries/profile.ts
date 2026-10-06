import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { ME_QUERY_KEY, type Me } from './me'

interface ProfileEdits {
  first_name?: string
  last_name?: string
  phone?: string | null
}

export function useProfile() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['profile'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/profile', { signal })
      if (error) throw new ApiError('Could not load your profile.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ProfileEdits) => {
      const { data, error } = await api.PATCH('/profile', { body })
      if (error) throw new ApiError('Could not update your profile.', error)
      return data
    },
    onSuccess: (data) => {
      // The name in the shell comes from `GET /me`: show the edit at once, then ask again.
      if (data) queryClient.setQueryData<Me>(ME_QUERY_KEY, (me) => (me ? { ...me, user: data } : me))
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: { current_password: string; new_password: string }) => {
      const { error } = await api.POST('/profile/change-password', { body })
      if (error) throw new ApiError('Current password is incorrect.', error)
    },
  })
}

/**
 * A phone number is added or changed by proof (second sign-in review, 2026-10-07): a code is
 * texted to the new number, and only the right code saves it. `PATCH /profile` no longer takes a
 * new number (400). Both calls are made with `mutateAsync` by the dialog that holds the code, so
 * every refusal reaches it: 429 `rate_limited` (the 30-second cooldown, the SMS limits, too many
 * wrong codes, each with `details.retry_after_seconds`) and 400 `invalid_otp`.
 */
export function useRequestPhoneCode() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const { data, error, response } = await api.POST('/auth/otp/request', { body: { phone } })
      if (error) throw new ApiError('Could not send a code.', error, (response as Response | undefined)?.status)
      return data
    },
  })
}

export function useVerifyPhoneCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ phone, code }: { phone: string; code: string }) => {
      const { error, response } = await api.POST('/auth/otp/verify', { body: { phone, code } })
      if (error) throw new ApiError('Could not verify the code.', error, (response as Response | undefined)?.status)
    },
    // The number is saved and verified in one step: the profile and `GET /me` both carry it.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}
