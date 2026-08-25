import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'

/** The uniform error envelope every endpoint returns — `openapi.yaml`'s `Error` schema. */
interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; request_id?: string }
}

/**
 * Carries the server's own explanation when there is one, falling back to the caller's generic
 * text when there isn't.
 *
 * Until 2026-08-25 this was a bare `class ApiError extends Error {}` and every call site threw a
 * hand-written string, discarding the response body. That mattered most exactly where the message
 * was most useful: the permission gates return copy like "Commission Details is limited to Admin
 * and Billing permission holders", and users saw "Could not load commission details" instead — a
 * denial indistinguishable from a network failure, with no hint whether to retry or ask an admin
 * for access.
 *
 * The fallback is kept rather than dropped: a 500 or a network failure has no useful `message`,
 * and "Could not load X" beats surfacing raw server text in those cases.
 */
export class ApiError extends Error {
  /** Machine-readable code, e.g. `forbidden` — for callers that branch on the reason. */
  readonly code?: string
  /** Correlates a user's report with the server log. */
  readonly requestId?: string

  constructor(fallback: string, body?: unknown) {
    const envelope = (body as ApiErrorEnvelope | undefined)?.error
    const message = envelope?.message?.trim()
    super(message && message.length > 0 ? message : fallback)
    this.name = 'ApiError'
    this.code = envelope?.code
    this.requestId = envelope?.request_id
  }
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const { data, error } = await api.POST('/auth/login', { body })
      if (error) throw new ApiError('Could not sign in.', error)
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
  return useMutation({
    mutationFn: async (body: { password: string }) => {
      const { data, error } = await api.POST('/auth/invite/{token}', {
        params: { path: { token } },
        body,
      })
      if (error) throw new ApiError('Could not accept this invitation.', error)
      return data
    },
    onSuccess: (data) => setSession(data),
  })
}
