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
