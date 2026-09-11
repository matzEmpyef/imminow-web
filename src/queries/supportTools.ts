import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type UserSearchResult = components['schemas']['UserSearchResult']
export type AllocationCandidate = components['schemas']['AllocationCandidate']

/**
 * Support Tools' user directory search (paged since 2026-09-11 — it used to return every match at
 * once). Requires at least two characters so a stray keystroke doesn't fetch half the user base.
 */
export function useUserSearch(q: string, cursor?: string, limit?: number) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const trimmed = q.trim()
  return useQuery({
    queryKey: ['user-search', trimmed, cursor, limit],
    queryFn: async () => {
      const { data, error } = await api.GET('/users/search', { params: { query: { q: trimmed, cursor, limit } } })
      if (error) throw new ApiError('Could not search users.', error)
      return data
    },
    enabled: isAuthed && trimmed.length >= 2,
  })
}

/** Reason is required since 2026-09-11 and kept on the audit record. */
export function useExportUserData() {
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/users/{id}/export', { params: { path: { id } }, body: { reason } })
      if (error) throw new ApiError('Could not generate a data export.', error)
      return data
    },
  })
}

// The escalation behind the guardian flow (2026-09-05): a 16- or 17-year-old whose parent
// declined twice, or who mistyped an address and used their one retry, cannot send another link
// themselves. Support can, and doing so clears the decline count — that IS the point of the
// escalation. Mandatory reason, audit-logged, like every other action on this page.
export function useResendGuardianLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      reason,
      guardian_name,
      email,
      phone,
    }: {
      id: string
      reason: string
      guardian_name?: string
      email?: string
      phone?: string
    }) => {
      const { data, error } = await api.POST('/users/{id}/guardian-consent/resend', {
        params: { path: { id } },
        body: { reason, guardian_name, email, phone },
      })
      if (error) throw new ApiError('Could not send the guardian link again.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-search'] }),
  })
}

/**
 * Changes a locked-out user's sign-in email (reworked 2026-09-11). The operator records how they
 * verified it's really the account holder; both addresses are emailed and the user is signed out
 * everywhere. 409 email_taken.
 */
export function useUpdateUserEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      new_email,
      reason,
      verification_method,
      verification_note,
    }: {
      id: string
      new_email: string
      reason: string
      verification_method: 'called_registered_phone' | 'video_call' | 'id_document' | 'other'
      verification_note?: string
    }) => {
      const { data, error } = await api.POST('/users/{id}/email', {
        params: { path: { id } },
        body: { new_email, reason, verification_method, verification_note },
      })
      if (error) throw new ApiError('Could not update this email.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-search'] }),
  })
}

/** Super-admin only on the server — the console hides the action entirely for anyone else. */
export function useEraseUserData() {
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/users/{id}/erase', { params: { path: { id } }, body: { reason } })
      if (error) throw new ApiError(error.error.message)
      return data
    },
  })
}

/**
 * Consultancies that can take this student, for the Switch consultancy action (reworked
 * 2026-09-11). The current consultancy is included in the list, blocked with reason
 * `current_consultancy`, which is also how the UI recovers "their current consultancy" for the
 * confirmation copy — `UserSearchResult` doesn't carry it for a student. `refusal` is set instead
 * of `items` when the case itself can't be moved (closed, or in dispute), and the UI shows that in
 * place of a picker rather than an empty list nobody can explain.
 */
export function useSwitchCandidates(journeyId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['switch-candidates', journeyId],
    queryFn: async () => {
      const { data, error } = await api.GET('/journeys/{id}/switch-candidates', {
        params: { path: { id: journeyId! } },
      })
      if (error) throw new ApiError('Could not load consultancies to switch to.', error)
      return data
    },
    enabled: isAuthed && Boolean(journeyId),
  })
}

/**
 * Moves a student to another consultancy (reworked 2026-09-11) — the old case closes as switched
 * and loses access to the student's shared documents, a new case opens at the chosen consultancy,
 * and the student and both consultancies are told. 409 case_closed / case_in_dispute, 400
 * same_consultancy / not_allocatable, 409 no_active_staff / subscription_lapsed.
 */
export function useSwitchConsultancy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      journeyId,
      new_consultancy_id,
      reason,
    }: {
      journeyId: string
      new_consultancy_id: string
      reason: string
    }) => {
      const { data, error } = await api.POST('/journeys/{id}/switch-consultancy', {
        params: { path: { id: journeyId } },
        body: { new_consultancy_id, reason },
      })
      if (error) throw new ApiError('Could not switch this student to a new consultancy.', error)
      return data
    },
    // H8 fix (frontend review, 1 Sep 2026): a switch used to invalidate nothing, so the journey's
    // lists/detail/dashboard kept showing the OLD consultancy until staleTime or a manual reload.
    onSuccess: (_data, { journeyId }) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['clients', journeyId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['user-search'] })
      queryClient.invalidateQueries({ queryKey: ['switch-candidates', journeyId] })
    },
  })
}
