import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'

// The three calls behind the parent's approval page (2026-09-05). All are public: a parent has no
// immiNow or Sentpo account and must not need one to answer a question about their own child. The
// token in the URL is the whole credential, which is why the payload it returns is deliberately
// thin — a first name and an age, never contact details, messages or documents.
//
// No auth header is required, and the shared client sending one when a staff member happens to be
// signed in on the same browser is harmless: the endpoints ignore it.

export function useGuardianPrompt(token: string) {
  return useQuery({
    queryKey: ['guardian-consent', token],
    enabled: token.length > 0,
    // A parent opens this once from a message. Refetching on focus would turn a spent token into
    // a "this link is not valid any more" flash while they are still reading the confirmation.
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.GET('/guardian-consent/{token}', { params: { path: { token } } })
      if (error) throw new ApiError('This link is not valid any more.', error)
      return data
    },
  })
}

export function useGuardianDecision(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      decision: 'approve' | 'decline'
      guardian_name: string
      confirms_adult_guardian: boolean
    }) => {
      const { data, error } = await api.POST('/guardian-consent/{token}', {
        params: { path: { token } },
        body,
      })
      if (error) throw new ApiError('Could not record your answer.', error)
      return data
    },
    onSuccess: (data) => queryClient.setQueryData(['guardian-consent', token], data),
  })
}

export function useGuardianWithdraw(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/guardian-consent/{token}/withdraw', {
        params: { path: { token } },
      })
      if (error) throw new ApiError('Could not withdraw your approval.', error)
      return data
    },
    onSuccess: (data) => queryClient.setQueryData(['guardian-consent', token], data),
  })
}
