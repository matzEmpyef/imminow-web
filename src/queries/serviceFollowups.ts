import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type ServiceFollowupRow = components['schemas']['ServiceFollowupRow']

/** Support's own outcome codes for a logged call (mock-server FOLLOWUP_OUTCOMES.service). */
export type ServiceFollowupOutcome = 'helped' | 'no_answer' | 'not_interested' | 'resolved'

/**
 * Students Support should reach out to (2026-09-11) — stuck before or during their case: no
 * consultancy yet, no reply from one, no plan, or a stalled application. Per STUDENT rather than
 * per case, since several signals fire before any case exists at all.
 */
export function useServiceFollowups(includeSnoozed = false) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['service-followups', 'list', includeSnoozed],
    queryFn: async () => {
      const { data, error } = await api.GET('/service-followups', {
        params: { query: { include_snoozed: includeSnoozed } },
      })
      if (error) throw new ApiError('Could not load the follow-up queue.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/** Calls and nudges on this student, newest first. */
export function useServiceNotes(studentId: string | null) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['service-followups', 'notes', studentId],
    queryFn: async () => {
      const { data, error } = await api.GET('/students/{id}/service-notes', {
        params: { path: { id: studentId! } },
      })
      if (error) throw new ApiError('Could not load the call history.', error)
      return data.items
    },
    enabled: isAuthed && Boolean(studentId),
  })
}

/** Record that support called a student. Same minimal shape as the payment queue's notes. */
export function useRecordServiceNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      studentId,
      note,
      outcome,
      callBackOn,
    }: {
      studentId: string
      note: string
      outcome?: ServiceFollowupOutcome
      callBackOn?: string
    }) => {
      const { data, error } = await api.POST('/students/{id}/service-notes', {
        params: { path: { id: studentId } },
        body: { note, outcome, call_back_on: callBackOn },
      })
      if (error) throw new ApiError('Could not save this note.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service-followups'] }),
  })
}

/** Sends the student a push notification. One per student per 24h — a second is refused (429). */
export function useSendNudge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ studentId, title, body }: { studentId: string; title?: string; body: string }) => {
      const { data, error } = await api.POST('/students/{id}/nudge', {
        params: { path: { id: studentId } },
        body: { title, body },
      })
      if (error) throw new ApiError('Could not send the push.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service-followups'] }),
  })
}
