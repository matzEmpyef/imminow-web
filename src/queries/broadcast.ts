import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type BroadcastInput = components['schemas']['BroadcastInput']

interface BroadcastHistoryFilters {
  audience?: 'all_students' | 'segment' | 'all_staff'
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

// A send lands as `queued` and the worker moves it to `sent`/`failed` within seconds, so a row in
// either non-final state gets re-polled until it settles. Nothing pending = no timer at all.
export const BROADCAST_POLL_MS = 3000
export function hasPendingBroadcast(items: { status?: string | null }[] | undefined): boolean {
  return Boolean(items?.some((b) => b.status === 'queued' || b.status === 'sending'))
}

export function useBroadcastHistory(filters: BroadcastHistoryFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['broadcast-history', filters],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/broadcast', {
        signal,
        params: {
          query: {
            filter: filters.audience ? { audience: filters.audience } : undefined,
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load broadcast history.', error)
      return data
    },
    enabled: isAuthed,
    refetchInterval: (query) => (hasPendingBroadcast(query.state.data?.items) ? BROADCAST_POLL_MS : false),
  })
}

// How many people a compose draft would reach is counted by the shared `useAudienceCount`
// (`queries/audienceCount.ts`), the same hook ads and events use.

export function useSendBroadcast() {
  const queryClient = useQueryClient()
  return useMutation({
    // Required since contract gate 9 — a retried send must never double-notify everyone. The key
    // comes from the caller (one per opened dialog and content, `usePayloadIdempotencyKey`): made
    // here it would be new on every attempt, and a retry after a lost response would send twice.
    mutationFn: async ({ body, idempotencyKey }: { body: BroadcastInput; idempotencyKey: string }) => {
      const { data, error, response } = await api.POST('/broadcast', {
        body,
        params: { header: { 'Idempotency-Key': idempotencyKey } },
      })
      // The server's own message names the problem — an unroutable destination, most likely —
      // and swallowing it would leave the sender guessing at a form they can still fix. The status
      // goes along so the dialog can tell a refusal (4xx) from "may have been sent" (5xx).
      if (error) throw new ApiError('Could not send this broadcast.', error, response.status)
      return data
    },
    // Settled, not only success: after a failed or unanswered send the history is the one place
    // that shows whether it went out.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['broadcast-history'] }),
  })
}
