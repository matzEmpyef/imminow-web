import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// Internal Messaging (Ultimate tier) — real conversation-thread parity with Lead/Client chat.
// The addressable "conversation" is who/what you're talking to: another employee's id for a DM,
// or the literal string 'team' for the consultancy-wide channel — mirrors leadId/clientId's role
// in useLeadMessages/useClientMessages exactly, just with a resolved-server-side pair instead of
// a pre-existing entity id.
export function useInternalConversations() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['internal-conversations'],
    queryFn: async () => {
      const { data, error } = await api.GET('/internal-conversations')
      if (error) throw new ApiError('Could not load conversations.', error)
      return data
    },
    enabled: isAuthed,
    refetchInterval: 15000,
  })
}

export function useInternalConversationMessages(idOrTeam: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['internal-conversations', idOrTeam, 'messages'],
    queryFn: async () => {
      const { data, error } =
        idOrTeam === 'team'
          ? await api.GET('/internal-conversations/team/messages')
          : await api.GET('/internal-conversations/with/{employeeId}/messages', {
              params: { path: { employeeId: idOrTeam! } },
            })
      if (error) throw new ApiError('Could not load messages.', error)
      return data
    },
    enabled: isAuthed && Boolean(idOrTeam),
    refetchInterval: 5000,
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
      if (error) throw new ApiError(error.error?.message ?? 'Could not unsend this message.')
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
