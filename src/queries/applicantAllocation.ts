import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { toPage } from '@/lib/pagination'

/**
 * The allocation queue, oldest first. Cursor-paged — `{ items, meta }` like every other cursor
 * list (contract gate 12b); no `next_cursor` means one complete page, so no pager. The key keeps
 * `['applicant-allocation-queue']` as its prefix, which allocate / resolve / dispute-resolve invalidate.
 */
export function useApplicantAllocationQueue(cursor?: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['applicant-allocation-queue', 'page', cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await api.GET('/applicant-allocation-queue', { params: { query: { cursor } } })
      if (error) throw new ApiError('Could not load the allocation queue.', error)
      return toPage(data)
    },
    enabled: isAuthed,
  })
}

// Where one row can go, with the reason any consultancy can't take it (2026-09-11). Fetched when
// the Allocate popup opens.
export function useAllocationCandidates(id: string, enabled: boolean) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['applicant-allocation-queue', 'candidates', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/applicant-allocation-queue/{id}/candidates', { params: { path: { id } } })
      if (error) throw new ApiError('Could not load consultancies for this applicant.', error)
      return data.items
    },
    enabled: isAuthed && enabled,
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
      if (error) throw new ApiError('Could not allocate this applicant.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applicant-allocation-queue'] }),
    // The queue moved under the admin: a concurrent allocation took the row (409 already_allocated,
    // so it should leave the list), or the chosen consultancy filled its last seat in the meantime
    // (409 seat_limit_reached, so its candidate row is stale). A live case (already_a_case) leaves
    // the row on the queue by design and needs no refresh.
    onError: (err) => {
      if (err instanceof ApiError && (err.code === 'already_allocated' || err.code === 'seat_limit_reached')) {
        queryClient.invalidateQueries({ queryKey: ['applicant-allocation-queue'] })
      }
    },
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
      if (error) throw new ApiError('Could not resolve this request.', error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applicant-allocation-queue'] })
      // The complaint gains a resolution note, so the Support queue is stale too.
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
    },
  })
}
