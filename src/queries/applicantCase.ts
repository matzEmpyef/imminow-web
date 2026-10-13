import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/authStore'

/**
 * Where a given applicant actually is (GET /admin/applicants/{id}; open to finance or support).
 * Read by the Applicant case view, and by the Dispute drawer's conversation export, which needs
 * the student behind a case (`student.id`): a dispute carries the case, not the student.
 */
export function useApplicantCase(journeyId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin', 'applicants', journeyId],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/admin/applicants/{id}', {
        signal,
        params: { path: { id: journeyId! } },
      })
      if (error) throw new ApiError('Could not load this applicant.', error)
      return data
    },
    enabled: isAuthed && Boolean(journeyId),
  })
}

/**
 * Whether to ask "Does the admission go to the new consultancy too?" before a case is moved (Phase
 * 8, DECISIONS 117 C-9 and 118). The contract does not serve a flag for "this case has an accepted
 * college" on the switch or allocation reads, so it is read from the case's applications here —
 * one place to swap when the contract names it. `journeyId` is undefined while the question is
 * not needed (nothing is read then).
 *
 * The case view is open to finance or support; an allocator with neither gets a refusal. Then the
 * question is asked anyway: it is harmless on a case with no accepted college (the server ignores
 * it), and silently leaving it out could leave an admission behind that the operator meant to send.
 */
export function useAsksAboutAdmission(journeyId: string | undefined): boolean {
  const view = useApplicantCase(journeyId)
  if (!journeyId) return false
  if (view.isError) return true
  return (view.data?.applications ?? []).some((application) => application.status === 'accepted')
}

/**
 * The two served booleans that decide whether the move form asks about the admission:
 * `has_accepted_college` and `has_recorded_payments`. Read from whatever the form already holds (a
 * search result, a queue row, the case view); `undefined` when a read does not carry them.
 */
function servedCarryFlags(source: unknown): { hasAcceptedCollege?: boolean; hasRecordedPayments?: boolean } {
  // replace with generated type after the contract join
  const record = (source && typeof source === 'object' ? source : {}) as Record<string, unknown>
  return {
    hasAcceptedCollege: typeof record.has_accepted_college === 'boolean' ? record.has_accepted_college : undefined,
    hasRecordedPayments: typeof record.has_recorded_payments === 'boolean' ? record.has_recorded_payments : undefined,
  }
}

/**
 * Which questions the move form asks. The first (does the admission go too) is asked when the case
 * has an accepted college; the second (does the money already recorded go too) only when the first
 * is asked and `has_recorded_payments` is not false. The served flags on the form's own read
 * (`served`) or on the case view win; the extra case-view read in `useAsksAboutAdmission` is only
 * the fallback, and is not made when the form's read already says. `journeyId` is undefined while
 * the questions are not needed.
 */
export function useCarryQuestions(
  journeyId: string | undefined,
  served?: unknown,
): { admission: boolean; payments: boolean } {
  const fromForm = servedCarryFlags(served)
  const needsRead = Boolean(journeyId) && fromForm.hasAcceptedCollege === undefined
  const view = useApplicantCase(needsRead ? journeyId : undefined)
  const fallback = useAsksAboutAdmission(needsRead ? journeyId : undefined)
  const fromView = servedCarryFlags(view.data)
  const hasAcceptedCollege = fromForm.hasAcceptedCollege ?? fromView.hasAcceptedCollege
  const hasRecordedPayments = fromForm.hasRecordedPayments ?? fromView.hasRecordedPayments
  if (!journeyId) return { admission: false, payments: false }
  const admission = hasAcceptedCollege ?? fallback
  return { admission, payments: admission && hasRecordedPayments !== false }
}
