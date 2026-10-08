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
