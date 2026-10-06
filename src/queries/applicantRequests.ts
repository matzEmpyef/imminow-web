import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type ApplicantRequest = components['schemas']['ApplicantRequest']

/** `pending` — still waiting for the student; `ended` — accepted, declined, expired or cancelled. */
export type ApplicantRequestView = 'pending' | 'ended'

/**
 * Everything that changes what the "Waiting for the student to accept" panel shows refreshes this
 * one prefix: a Create Applicant that answered 202, a cancel, and the bell's live signal (the
 * student's answer reaches staff as a notification — lib/realtime/queryCache.ts).
 */
export function invalidateApplicantRequests(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ['applicant-requests'] })
}

/**
 * The requests Create Applicant sent to people who already have a Sentpo account (contract gate
 * 12f). Each row carries only what the consultancy's own staff typed — nothing from the account.
 * Newest first, cursor-paged; the route has no sort and no search.
 */
export function useApplicantRequests({
  status,
  cursor,
  limit,
}: {
  status: ApplicantRequestView
  cursor?: string
  limit?: number
}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['applicant-requests', status, { cursor: cursor ?? null, limit: limit ?? null }],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/applicant-requests', {
        signal,
        params: { query: { filter: { status }, cursor, limit } },
      })
      if (error) throw new ApiError('Could not load the requests.', error)
      return data
    },
    enabled: isAuthed,
  })
}
