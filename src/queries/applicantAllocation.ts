import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useApplicantAllocationQueue() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['applicant-allocation-queue'],
    queryFn: async () => {
      const { data, error } = await api.GET('/applicant-allocation-queue')
      if (error) throw new ApiError('Could not load the allocation queue.')
      return data
    },
    enabled: isAuthed,
  })
}

export function useAllocateApplicant(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (consultancyId: string) => {
      const { error } = await api.POST('/applicant-allocation-queue/{id}/allocate', {
        params: { path: { id } },
        body: { consultancy_id: consultancyId },
      })
      if (error) throw new ApiError('Could not allocate this applicant.')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applicant-allocation-queue'] }),
  })
}

/**
 * Decline a consultancy-change request without moving the student.
 *
 * The row leaves the transfer list and the journey is untouched — same consultancy, same plan,
 * same consultant. The note is stamped on the complaint so Support can see the decision and who
 * made it. It does NOT close the complaint: refusing a transfer is not the same as resolving the
 * grievance, which is handled off-platform.
 */
export function useResolveAllocationRequest(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (note: string) => {
      const { error } = await api.POST('/applicant-allocation-queue/{id}/resolve', {
        params: { path: { id } },
        body: { note },
      })
      if (error) throw new ApiError(error.error?.message ?? 'Could not resolve this request.')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applicant-allocation-queue'] })
      // The complaint gains a resolution note, so the Support queue is stale too.
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
    },
  })
}
