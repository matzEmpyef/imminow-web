import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

export type Complaint = components['schemas']['Complaint']
export type SupportCaseNote = components['schemas']['SupportCaseNote']
export type ComplaintNoteOutcome = NonNullable<SupportCaseNote['outcome']>

/**
 * Platform Admin Complaints queue (build reference 1.27, rebuilt 2026-09-11 on the paged/notes/
 * escalate contract). Student dispute reports raised from the Sentpo app's low-prominence "Report
 * a problem" entry — the consultancy involved never sees these.
 */
export interface ComplaintsFilters {
  /** Comma list, e.g. "open,in_review" for "Unresolved". Omit for All. */
  status?: string
  category?: string
  search?: string
  cursor?: string
  limit?: number
}

function complaintsFilter(filters: ComplaintsFilters): Record<string, string> {
  const filter: Record<string, string> = {}
  if (filters.status) filter.status = filters.status
  if (filters.category) filter.category = filters.category
  return filter
}

export function useComplaints(filters: ComplaintsFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['complaints', filters],
    queryFn: async () => {
      const filter = complaintsFilter(filters)
      const { data, error } = await api.GET('/complaints', {
        params: {
          query: {
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            search: filters.search,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load complaints.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export interface UpdateComplaintInput {
  /** 'in_review' = Pick up (caller becomes owner, student is notified). */
  status?: 'in_review' | 'resolved'
  /** Required when status is 'resolved' — the student sees this note in the app. */
  resolution_note?: string
  /** Take the complaint over from whoever holds it. */
  assign_to_me?: boolean
}

/** Picking up, taking over, or resolving one complaint. 409 already_resolved / dispute_open. */
export function useUpdateComplaint(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: UpdateComplaintInput) => {
      const { data, error } = await api.PATCH('/complaints/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this complaint.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
      queryClient.invalidateQueries({ queryKey: ['admin-attention'] })
    },
  })
}

/**
 * Turns a complaint into a dispute — the case freezes for both sides, the student is told their
 * case is paused, and the consultancy is told the case is under review without ever seeing the
 * complaint itself. 200 when attached to a dispute already open on the case, 201 when a new one is
 * created. 409 no_case / already_escalated / already_closed / already_resolved.
 */
export function useEscalateComplaint(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (reason?: string) => {
      const { data, error } = await api.POST('/complaints/{id}/escalate', {
        params: { path: { id } },
        body: reason ? { reason } : undefined,
      })
      if (error) throw new ApiError('Could not escalate this complaint.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
      queryClient.invalidateQueries({ queryKey: ['disputes'] })
      queryClient.invalidateQueries({ queryKey: ['admin-attention'] })
    },
  })
}

export function useComplaintNotes(id: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['complaint-notes', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/complaints/{id}/notes', { params: { path: { id } } })
      if (error) throw new ApiError('Could not load the notes on this complaint.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}

/** Adds a working note. 409 once the complaint is resolved — its record is closed. */
export function useAddComplaintNote(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { note: string; outcome?: ComplaintNoteOutcome }) => {
      const { data, error } = await api.POST('/complaints/{id}/notes', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not add this note.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint-notes', id] })
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
    },
  })
}
