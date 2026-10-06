import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useRealtimeOpen } from '@/lib/realtime'
import { internalMessagesKey } from '@/lib/realtime/queryCache'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// Internal Messaging (Ultimate tier) — real conversation-thread parity with Lead/Client chat.
// The addressable "conversation" is who/what you're talking to: another employee's id for a DM,
// or the literal string 'team' for the consultancy-wide channel — mirrors leadId/clientId's role
// in useLeadMessages/useClientMessages exactly, just with a resolved-server-side pair instead of
// a pre-existing entity id.
//
// Polls every 15s as a fallback only (contract gate 9, K11) — while the realtime socket is open,
// `internal.message`/`internal.unsent` frames patch the open thread's cache directly and the list
// is just invalidated alongside it, so the poll switches itself off; same shape
// `useConversations`/`useLeadMessages` already use for lead/client chat.
export function useInternalConversations() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const realtimeOpen = useRealtimeOpen()
  return useQuery({
    queryKey: ['internal-conversations'],
    queryFn: async () => {
      const { data, error } = await api.GET('/internal-conversations')
      if (error) throw new ApiError('Could not load conversations.', error)
      return data
    },
    enabled: isAuthed,
    refetchInterval: realtimeOpen ? false : 15000,
  })
}

/**
 * Paged from the newest end (contract gate 9, K12) — `before`/`limit`, same idiom as `GET
 * /leads/{id}/messages`: the first page is the newest `limit` messages, oldest-to-newest within
 * the page; `meta.next_cursor` is the oldest message's id, sent back as `before` to walk further
 * into history. `useInfiniteQuery`'s `fetchNextPage` extends `data.pages` with older pages at the
 * END of the array (`pages[0]` stays the newest-fetched page), which is exactly the convention
 * `applyInternalMessage` (lib/realtime/queryCache.ts) relies on to know where to append a live
 * frame. The mock (frozen post-Wave-3) ignores `before`/`limit` and always answers everything in
 * one page with `next_cursor: null` — against it, `hasNextPage` is simply always false and "Load
 * earlier messages" never renders, which is exactly today's behaviour.
 */
export function useInternalConversationMessages(idOrTeam: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const realtimeOpen = useRealtimeOpen()
  return useInfiniteQuery({
    queryKey: internalMessagesKey(idOrTeam ?? ''),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const { data, error } =
        idOrTeam === 'team'
          ? await api.GET('/internal-conversations/team/messages', { params: { query: { before: pageParam } } })
          : await api.GET('/internal-conversations/with/{employeeId}/messages', {
              params: { path: { employeeId: idOrTeam! }, query: { before: pageParam } },
            })
      if (error) throw new ApiError('Could not load messages.', error)
      return data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.next_cursor ?? undefined,
    enabled: isAuthed && Boolean(idOrTeam),
    refetchInterval: realtimeOpen ? false : 5000,
  })
}

export function useSendInternalMessage(idOrTeam: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) => {
      const { data, error } =
        idOrTeam === 'team'
          ? await api.POST('/internal-conversations/team/messages', { body: { content } })
          : await api.POST('/internal-conversations/with/{employeeId}/messages', {
              params: { path: { employeeId: idOrTeam! } },
              body: { content },
            })
      if (error) throw new ApiError('Could not send this message.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal-conversations', idOrTeam, 'messages'] })
      queryClient.invalidateQueries({ queryKey: ['internal-conversations'] })
    },
  })
}

// Unsend-while-unread (user request 13, 2026-08-19). The server owns the rule — it compares the
// RECIPIENT's (or, for Team, every colleague's) per-conversation read row against the message's
// created_at and answers 409 `already_read` once the words have been seen. The 409's own message
// is surfaced verbatim rather than a generic string: "why can't I unsend this" has a specific,
// user-facing answer the server already wrote.
export function useUnsendInternalMessage(idOrTeam: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } =
        idOrTeam === 'team'
          ? await api.DELETE('/internal-conversations/team/messages/{messageId}', {
              params: { path: { messageId } },
            })
          : await api.DELETE('/internal-conversations/with/{employeeId}/messages/{messageId}', {
              params: { path: { employeeId: idOrTeam!, messageId } },
            })
      if (error) throw new ApiError('Could not unsend this message.', error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal-conversations', idOrTeam, 'messages'] })
      queryClient.invalidateQueries({ queryKey: ['internal-conversations'] })
    },
  })
}

export function useMarkInternalConversationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (idOrTeam: string) => {
      const { error } =
        idOrTeam === 'team'
          ? await api.POST('/internal-conversations/team/read')
          : await api.POST('/internal-conversations/with/{employeeId}/read', {
              params: { path: { employeeId: idOrTeam } },
            })
      if (error) throw new ApiError('Could not mark this conversation read.', error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal-conversations'] })
    },
  })
}
