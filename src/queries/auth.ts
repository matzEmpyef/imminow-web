import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/authStore'
import { primeMe } from './me'
import { noteSessionBegan } from '@/lib/sessionNotice'

// ApiError moved to api/errors.ts (N1 fix, 2026-09-01 — see its doc comment for why); re-exported
// here so the many existing `import { ApiError } from '@/queries/auth'` sites keep working.
export { ApiError }

// Both ways into a session (sign-in, accepting an invite) do the same things in the same order:
// ask `GET /me` with the new token and put the answer in the cache, THEN store the tokens.
// Storing the tokens is what flips every guard to "signed in", so by then the answer the guards
// read is already there and the first screen is the right one (review F-036).
//
// A new session also starts from an empty cache (review F-165). An invitation can be accepted in
// a tab where another account is still signed in; that account's session is closed first (which
// stops its live connection and idle clock) and everything it had loaded is dropped, so the new
// person is never shown the previous person's lists. The invitation itself is kept: the page
// that is accepting it is still reading it.
const KEPT_ACROSS_SESSIONS = 'invite'

async function beginSession(
  queryClient: QueryClient,
  tokens: { access_token: string; refresh_token: string; user?: { id?: string } },
) {
  const { accessToken, clear, setSession } = useAuthStore.getState()
  if (accessToken) clear()
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== KEPT_ACROSS_SESSIONS })
  await primeMe(queryClient, tokens.access_token)
  noteSessionBegan(tokens.user?.id)
  setSession(tokens)
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      // `platform` lands on the sign-in event (2026-09-10) — the console is always the web app.
      const { data, error, response } = await api.POST('/auth/login', { body: { ...body, platform: 'web' } })
      // The refusal's own sentence is shown as it comes: a wrong password, a disabled account, or
      // 403 `account_locked_for_erasure` (the account is scheduled for deletion; `details.due_at`).
      if (error) throw new ApiError('Could not sign in.', error, (response as Response | undefined)?.status)
      await beginSession(queryClient, data)
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
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/auth/invite/{token}', { signal, params: { path: { token } } })
      if (error) throw new ApiError('Could not load this invitation.', error)
      return data
    },
    retry: false,
  })
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { password: string }) => {
      const { data, error } = await api.POST('/auth/invite/{token}', {
        params: { path: { token } },
        body,
      })
      if (error) throw new ApiError('Could not accept this invitation.', error)
      await beginSession(queryClient, data)
      return data
    },
  })
}
