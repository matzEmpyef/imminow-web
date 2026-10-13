import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { isRetryable } from '@/api/errors'
import type { components } from '@/api/schema'

export type UserSearchResult = components['schemas']['UserSearchResult']

/**
 * Support Tools' user directory search (paged since 2026-09-11 — it used to return every match at
 * once). Requires at least two characters so a stray keystroke doesn't fetch half the user base.
 */
export function useUserSearch(q: string, cursor?: string, limit?: number) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const trimmed = q.trim()
  return useQuery({
    queryKey: ['user-search', trimmed, cursor, limit],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/users/search', { signal, params: { query: { q: trimmed, cursor, limit } } })
      if (error) throw new ApiError('Could not search users.', error)
      return data
    },
    enabled: isAuthed && trimmed.length >= 2,
    // A 429 here is this operator's hourly allowance for the tool (review F-103), not a busy
    // moment: asking again by itself only uses up more of it, so the message is shown at once.
    retry: (failureCount, error) =>
      failureCount < 2 && isRetryable(error) && !(error instanceof ApiError && error.status === 429),
  })
}

/**
 * Support asks for a copy of a user's data on their behalf. Reason is required since 2026-09-11
 * and kept on the audit record. The copy is for the USER: their verified email is told when it is
 * ready and they download it from inside the product within 7 days. Support never receives it.
 *
 * Refused 409 (gate 12f) with the server's own sentence: `email_unverified` (no verified address
 * to tell), `export_on_hold` (Support changed the sign-in email under 48 hours ago;
 * `details.available_at` says when it opens), `conflict` (an erasure is pending).
 */
export function useExportUserData() {
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error, response } = await api.POST('/users/{id}/export', { params: { path: { id } }, body: { reason } })
      if (error) throw new ApiError('Could not generate a data export.', error, (response as Response | undefined)?.status)
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
 * RECORDS a new sign-in email for a locked-out user (owner ruling 4, 2026-10-07). Support no
 * longer changes the email itself: the address waits on the account (`pending_email`,
 * `pending_email_until` on the answer) until the person proves it, and nothing else changes —
 * the current email keeps signing them in and nobody is signed out. The operator records how
 * they verified it's really the account holder.
 *
 * Refusals carry the server's own sentence: 409 `email_taken` (another account has the address,
 * as its email or waiting), 409 `conflict` (the account is scheduled for deletion), 403, 429
 * `rate_limited` (this operator's hourly allowance; `details.retry_after_seconds`).
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
      const { data, error, response } = await api.POST('/users/{id}/email', {
        params: { path: { id } },
        body: { new_email, reason, verification_method, verification_note },
      })
      if (error) throw new ApiError('Could not record this email.', error, (response as Response | undefined)?.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-search'] }),
  })
}

/**
 * RECORDS a new phone number for a student who cannot use their old one (owner ruling 1,
 * 2026-10-07). As with the email: the number waits on the account (`pending_phone`,
 * `pending_phone_until`) until the student proves it by signing in with it, and nothing else
 * changes. Needs a reason and the operator's own password.
 *
 * Refusals carry the server's own sentence: 400 `validation_failed` (not a student, an invalid
 * number, the number already on the account), `step_up_required`, `invalid_current_password`;
 * 403; 404; 409 `identifier_in_use` (another account has the number, proven or waiting) or
 * `conflict` (scheduled for deletion); 429 `rate_limited` (`details.retry_after_seconds`).
 */
export function useRecordUserPhone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      new_phone,
      reason,
      password,
    }: {
      id: string
      new_phone: string
      reason: string
      password: string
    }) => {
      const { data, error, response } = await api.POST('/users/{id}/phone', {
        params: { path: { id } },
        body: { new_phone, reason, password },
      })
      if (error) {
        throw new ApiError('Could not record this phone number.', error, (response as Response | undefined)?.status)
      }
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-search'] }),
  })
}

export type DateOfBirthCorrection = components['schemas']['DateOfBirthCorrection']

/**
 * Support corrects a student's date of birth against a document (owner decision 3, lane x). The
 * student cannot change a recorded date themselves; this is the one way it changes. Needs a reason
 * (which document was checked; kept on the audit record) and the operator's own password.
 *
 * The answer says what the correction did to the guardian requirement (`guardian_effect`), which
 * always follows the date. Refusals carry the server's own sentence: 400 `step_up_required`,
 * `invalid_current_password`, `validation_failed`; 422 `below_minimum_age`; 429 `rate_limited`
 * (`details.retry_after_seconds`).
 */
export function useCorrectDateOfBirth() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      date_of_birth,
      reason,
      password,
    }: {
      id: string
      date_of_birth: string
      reason: string
      password: string
    }) => {
      const { data, error, response } = await api.POST('/users/{id}/date-of-birth', {
        params: { path: { id } },
        body: { date_of_birth, reason, password },
      })
      if (error) {
        throw new ApiError('Could not correct the date of birth.', error, (response as Response | undefined)?.status)
      }
      return data
    },
    // The search row carries the student's guardian state, which the correction may have changed.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-search'] }),
  })
}

export type ErasureRequest = components['schemas']['ErasureRequest']
/**
 * `freelancer_owed_inr` and `freelancer_owed_notice` (Phase 8 fault check 3) are new in the final
 * contract: replace with generated type after the contract join. The notice is the warning to show
 * before the operator confirms ("This freelancer is still owed ₹21,311 in earnings that have not
 * been paid. …"); null unless something is owed. A warning only — the deletion is never refused for
 * it. The console shows it as served and computes nothing.
 */
export type ErasurePreview = components['schemas']['ErasurePreview'] & {
  freelancer_owed_inr?: number | null
  freelancer_owed_notice?: string | null
}

/**
 * What Support's deletion of this account will close, read before the operator confirms (owner
 * decision 56, 2026-10-08): the disputes open on the account's cases, and the sentence saying
 * they are closed automatically by the deletion. An empty list and no sentence when there is
 * none. Super Admin only, like the erasure itself.
 */
export function useErasurePreview(userId: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['erasure-preview', userId],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/users/{id}/erase', { signal, params: { path: { id: userId } } })
      if (error) throw new ApiError('Could not check this account for open disputes.', error)
      // The one cast for the fields above: replace with generated type after the contract join.
      return data as ErasurePreview
    },
    enabled: isAuthed && Boolean(userId),
    // A dispute can be opened or resolved at any moment: every opening of the form asks afresh.
    staleTime: 0,
  })
}
export type ErasureQueued = components['schemas']['ErasureQueuedOut']

/**
 * Erase a user's data (gate 12f, owner decision 20). Super Admin only on the server — the console
 * hides the action for anyone else — and it needs the operator's own password as well as a reason.
 *
 * The account is locked at once and its open cases and chats close; the personal data is erased 30
 * days later (`due_at`) and can be kept until then. `immediate: true` skips the window (a legal
 * request): nothing can be cancelled. Answers `erasure_pending` or `erasure_queued`.
 *
 * Refusals carry the server's own sentence: 400 `step_up_required`, `invalid_current_password`,
 * `validation_failed`; 409 `lockout_guard` (the person still holds an active role), `conflict`
 * (an erasure is already pending; `details.due_at`).
 */
export function useEraseUserData() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      reason,
      password,
      immediate,
    }: {
      id: string
      reason: string
      password: string
      immediate?: boolean
    }) => {
      const { data, error, response } = await api.POST('/users/{id}/erase', {
        params: { path: { id } },
        body: { reason, password, ...(immediate ? { immediate: true } : {}) },
      })
      if (error) throw new ApiError('Could not erase this user.', error, (response as Response | undefined)?.status)
      return data
    },
    // Settled, not only on success: a `conflict` means an erasure was already pending, which the
    // search row and the Pending erasures list on screen did not know yet.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['erasures'] })
      queryClient.invalidateQueries({ queryKey: ['user-search'] })
    },
  })
}

export type ErasureListStatus = 'pending' | 'ended'

/**
 * Support Tools' Pending erasures list (gate 12f; `support_tools`). `pending`: every erasure not
 * yet finished or cancelled, soonest first. `ended`: completed or cancelled in the last 90 days.
 */
export function useErasures(status: ErasureListStatus, cursor?: string, limit?: number) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['erasures', status, cursor, limit],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/admin/erasures', {
        signal,
        params: { query: { filter: { status }, cursor, limit } },
      })
      if (error) throw new ApiError('Could not load scheduled erasures.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/**
 * Keep the account: cancels a pending erasure (Super Admin, with a reason). The person can sign in
 * again and their verified email is told. Cases and chats that closed when the erasure was
 * requested stay closed. 404 when nothing is pending; 409 `conflict` once the erasing has started.
 */
export function useCancelErasure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const { data, error, response } = await api.DELETE('/users/{id}/erasure', {
        params: { path: { id: userId } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not cancel this erasure.', error, (response as Response | undefined)?.status)
      return data
    },
    // Settled: a 404 or a 409 means the list on screen was out of date (already cancelled, or the
    // erasing has started), so it is read again either way.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['erasures'] })
      queryClient.invalidateQueries({ queryKey: ['user-search'] })
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
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/journeys/{id}/switch-candidates', {
        signal,
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
      carry,
    }: {
      journeyId: string
      new_consultancy_id: string
      reason: string
      /** What goes with the case, all four keys (owner's ruling on review I-014, 2026-10-08). */
      carry: components['schemas']['CaseCarry']
    }) => {
      const { data, error } = await api.POST('/journeys/{id}/switch-consultancy', {
        params: { path: { id: journeyId } },
        body: { new_consultancy_id, reason, carry },
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
