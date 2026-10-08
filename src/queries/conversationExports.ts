import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/authStore'
import type { components, paths } from '@/api/schema'

// Conversation export for disputes (owner ruling, 2026-10-06; decisions 60 and 61): platform
// staff holding `support`, and Super Admins, export the whole conversation between one student
// and one consultancy as a PDF. It is prepared in the background, kept 24 hours, and can be
// downloaded by anyone who may open the page, whoever asked for it.

export type ConversationExport = components['schemas']['ConversationExport']
export type StudentConversation =
  paths['/users/{id}/conversations']['get']['responses'][200]['content']['application/json']['items'][number]

/** How often the transcript just asked for is checked while it is being prepared. */
export const CONVERSATION_EXPORT_POLL_MS = 3000
/** How often the list is read again while a transcript on it (a colleague's, say) is being prepared. */
const EXPORT_LIST_POLL_MS = 10_000

/** Still being prepared: neither ready nor failed. */
export function isPreparing(item: Pick<ConversationExport, 'status'> | undefined): boolean {
  return item?.status === 'queued' || item?.status === 'processing'
}

const exportsKey = (studentId: string) => ['conversation-exports', studentId] as const

/**
 * The consultancies a student has a conversation with, the one talked to last first: the picker.
 * 404 for an unknown user, 409 when the account is not a student's (the server's sentence).
 */
export function useStudentConversations(studentId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['student-conversations', studentId],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/users/{id}/conversations', { signal, params: { path: { id: studentId! } } })
      if (error) throw new ApiError('Could not load this student’s conversations.', error)
      return data
    },
    enabled: isAuthed && Boolean(studentId),
  })
}

/**
 * Every export made of this student's conversations, whoever asked, newest first (the first
 * page). Read again now and then while one of them is still being prepared, so a row turns into
 * a Download button without a reload.
 */
export function useStudentConversationExports(studentId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: exportsKey(studentId ?? ''),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/users/{id}/conversation-exports', {
        signal,
        params: { path: { id: studentId! } },
      })
      if (error) throw new ApiError('Could not load the recent exports.', error)
      return data
    },
    enabled: isAuthed && Boolean(studentId),
    refetchInterval: (query) => (query.state.data?.items.some(isPreparing) ? EXPORT_LIST_POLL_MS : false),
  })
}

/**
 * Ask for a transcript. Always answered 202 `queued`; `useConversationExport` follows it.
 * Refusals carry the server's own sentence: 400, 404 (no conversation with that consultancy),
 * 409 (not a student), 429 (this hour's allowance is used).
 */
export function useRequestConversationExport(studentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { consultancy_id: string; reason: string }) => {
      const { data, error, response } = await api.POST('/users/{id}/conversation-exports', {
        params: { path: { id: studentId } },
        body,
      })
      if (error || !data) {
        throw new ApiError('Could not request this export.', error, (response as Response | undefined)?.status)
      }
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exportsKey(studentId) }),
  })
}

/**
 * One export's state, asked every few seconds until it is ready or has failed, or the read is
 * refused. It stops when the dialog showing it closes (the query is no longer observed). `seed`
 * is the 202 answer, so the first state is on screen at once. Once it settles, the student's list
 * is read again so its row says the same.
 */
export function useConversationExport(seed: ConversationExport | null) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['conversation-export', seed?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/conversation-exports/{id}', { signal, params: { path: { id: seed!.id } } })
      if (error) throw new ApiError('Could not check this export.', error)
      return data
    },
    enabled: isAuthed && seed != null,
    initialData: seed ?? undefined,
    // The seed is the request's own answer: the first read waits one interval, like the rest.
    staleTime: CONVERSATION_EXPORT_POLL_MS,
    refetchInterval: (q) => (isPreparing(q.state.data) && !q.state.error ? CONVERSATION_EXPORT_POLL_MS : false),
    refetchOnWindowFocus: false,
  })

  const studentId = seed?.student_id
  const settled = Boolean(query.data) && !isPreparing(query.data)
  useEffect(() => {
    if (settled && studentId) void queryClient.invalidateQueries({ queryKey: exportsKey(studentId) })
  }, [settled, studentId, queryClient])

  return query
}

/**
 * A download link for a finished transcript. It works for five minutes (`expires_in_seconds`),
 * so it is asked for at the moment of the click and never kept. Each download is recorded under
 * the downloader's own name. 404 unknown; 409 not ready or failed; 410 no longer available; 429
 * the downloader's allowance for this hour is used.
 */
export function useDownloadConversationExport(studentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await api.POST('/conversation-exports/{id}/download', { params: { path: { id } } })
      if (error || !data) {
        throw new ApiError('Could not get this download.', error, (response as Response | undefined)?.status)
      }
      return data
    },
    // A refusal means the row on screen was out of date (it has gone, or was withdrawn).
    onError: () => queryClient.invalidateQueries({ queryKey: exportsKey(studentId) }),
  })
}

/**
 * What a refused read or download of ONE export says: the server's own sentence (409 not ready
 * or failed, 410 gone, 429 the hour's allowance), except for 404, where the transcript is no
 * longer there (an erased student's transcripts are withdrawn at once).
 */
export function conversationExportErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return 'This export is no longer available.'
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
