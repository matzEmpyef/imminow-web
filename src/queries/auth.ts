import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/authStore'
import { primeMe } from './me'

// ApiError moved to api/errors.ts (N1 fix, 2026-09-01 — see its doc comment for why); re-exported
// here so the many existing `import { ApiError } from '@/queries/auth'` sites keep working.
export { ApiError }

// Both ways into a session (sign-in, accepting an invite) do the same two things in the same
// order: ask `GET /me` with the new token and put the answer in the cache, THEN store the tokens.
// Storing the tokens is what flips every guard to "signed in", so by then the answer the guards
// read is already there and the first screen is the right one (review F-036).
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      // `platform` lands on the sign-in event (2026-09-10) — the console is always the web app.
      const { data, error, response } = await api.POST('/auth/login', { body: { ...body, platform: 'web' } })
      // The refusal's own sentence is shown as it comes: a wrong password, a disabled account, or
      // 403 `account_locked_for_erasure` (the account is scheduled for deletion; `details.due_at`).
      if (error) throw new ApiError('Could not sign in.', error, (response as Response | undefined)?.status)
      await primeMe(queryClient, data.access_token)
      setSession(data)
      return data
    },
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
      if (error) throw new ApiError('Could not reset your password.', error)
    },
  })
}

export function useInvite(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: async () => {
      const { data, error } = await api.GET('/auth/invite/{token}', { params: { path: { token } } })
      if (error) throw new ApiError('Could not load this invitation.', error)
      return data
    },
    retry: false,
  })
}

export function useAcceptInvite(token: string) {
  const setSession = useAuthStore((s) => s.setSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { password: string }) => {
      const { data, error } = await api.POST('/auth/invite/{token}', {
        params: { path: { token } },
        body,
      })
      if (error) throw new ApiError('Could not accept this invitation.', error)
      await primeMe(queryClient, data.access_token)
      setSession(data)
      return data
    },
  })
}
