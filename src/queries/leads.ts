import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { applyChatMessage } from '@/lib/realtime/queryCache'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { useThreadMessages } from './threadMessages'
import { invalidateApplicantRequests } from './applicantRequests'
import type { components } from '@/api/schema'

type InternalNote = components['schemas']['InternalNote']
type NotesPage = { items: InternalNote[]; meta: components['schemas']['PaginatedMeta'] }
type InfiniteNotesData = { pages: NotesPage[]; pageParams: (string | undefined)[] }

interface LeadListFilters {
  unallocated?: boolean
  assignedToMe?: boolean
  unattended?: boolean
  showClosed?: boolean
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useLeads(filters: LeadListFilters = {}, options: { enabled?: boolean } = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async ({ signal }) => {
      const filter: Record<string, string> = {}
      if (filters.unallocated !== undefined) filter.unallocated = String(filters.unallocated)
      if (filters.assignedToMe !== undefined) filter.assigned_to_me = String(filters.assignedToMe)
      if (filters.unattended !== undefined) filter.unattended = String(filters.unattended)
      if (filters.showClosed !== undefined) filter.show_closed = String(filters.showClosed)

      const { data, error } = await api.GET('/leads', {
        signal,
        params: {
          query: {
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load leads.', error)
      return data
    },
    enabled: isAuthed && (options.enabled ?? true),
  })
}

export function useLead(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['leads', id],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/leads/{id}', { signal, params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load this lead.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}

function invalidateLeads(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['leads'] })
  queryClient.invalidateQueries({ queryKey: ['dashboard'] })
}

export function useCreateLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      name: string
      phone?: string | null
      email?: string | null
      source: 'referral' | 'website' | 'walk_in' | 'social' | 'other'
      notes?: string | null
    }) => {
      const { data, error } = await api.POST('/leads', { body })
      if (error) throw new ApiError('Could not add this lead.', error)
      return data
    },
    onSuccess: () => invalidateLeads(queryClient),
  })
}

interface ImportValidateRow {
  row_number: number
  valid: boolean
  name?: string
  phone?: string | null
  email?: string | null
  errors?: string[]
}

interface ImportValidateResult {
  batch_id: string
  valid_count: number
  invalid_count: number
  rows: ImportValidateRow[]
}

export function useValidateLeadImport() {
  return useMutation({
    mutationFn: async (file: File): Promise<ImportValidateResult> => {
      const formData = new FormData()
      formData.append('file', file)
      const { data, error } = await api.POST('/leads/import/validate', {
        body: formData as unknown as { file?: string },
        bodySerializer: () => formData,
      })
      if (error) throw new ApiError('Could not validate the CSV file.', error)
      return data as unknown as ImportValidateResult
    },
  })
}

export function useCommitLeadImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      batch_id: string
      source?: 'referral' | 'website' | 'walk_in' | 'social' | 'other'
    }) => {
      const { data, error } = await api.POST('/leads/import/commit', {
        // T3 (third-pass review): the key derives from the batch itself, not a fresh UUID per
        // attempt — committing one validated batch is ONE operation however many times the
        // button fires, and the batch_id is already the natural identity of that operation.
        params: { header: { 'Idempotency-Key': `commit-${body.batch_id}` } },
        body,
      })
      if (error) throw new ApiError('Could not commit the import.', error)
      return data
    },
    onSuccess: () => invalidateLeads(queryClient),
  })
}

export function useAllocateLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, employeeId }: { id: string; employeeId: string }) => {
      const { data, error } = await api.POST('/leads/{id}/allocate', {
        params: { path: { id } },
        body: { employee_id: employeeId },
      })
      if (error) throw new ApiError('Could not allocate this lead.', error)
      return data
    },
    onSuccess: () => invalidateLeads(queryClient),
  })
}

export function useSetLeadTags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      const { data, error } = await api.PATCH('/leads/{id}/tags', {
        params: { path: { id } },
        body: { tags },
      })
      if (error) throw new ApiError('Could not update tags for this lead.', error)
      return data
    },
    onSuccess: () => invalidateLeads(queryClient),
  })
}

export function useSetLeadBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, branchId }: { id: string; branchId: string }) => {
      const { data, error } = await api.PATCH('/leads/{id}/branch', {
        params: { path: { id } },
        body: { branch_id: branchId },
      })
      if (error) throw new ApiError('Could not update the branch for this lead.', error)
      return data
    },
    onSuccess: () => invalidateLeads(queryClient),
  })
}

export function useCloseLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/leads/{id}/close', {
        params: { path: { id } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not close this lead.', error)
      return data
    },
    onSuccess: (_data, { id }) => {
      invalidateLeads(queryClient)
      queryClient.invalidateQueries({ queryKey: ['leads', id] })
    },
  })
}

export function useReopenLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/leads/{id}/reopen', { params: { path: { id } } })
      if (error) throw new ApiError('Could not reopen this lead.', error)
      return data
    },
    onSuccess: (_data, id) => {
      invalidateLeads(queryClient)
      queryClient.invalidateQueries({ queryKey: ['leads', id] })
    },
  })
}

export function useBulkAllocateLeads() {
  const queryClient = useQueryClient()
  return useMutation({
    // T8: caller supplies the key (minted once per menu open) — a per-attempt UUID made every
    // double-fire a distinct operation, defeating the header. Same N7 pattern as payments.
    mutationFn: async ({
      idempotencyKey,
      ...body
    }: {
      lead_ids: string[]
      employee_id: string
      idempotencyKey: string
    }) => {
      const { data, error, response } = await api.POST('/leads/bulk-allocate', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body,
      })
      if (error) throw new ApiError('Could not allocate the selected leads.', error, (response as Response | undefined)?.status)
      return data
    },
    onSuccess: () => invalidateLeads(queryClient),
  })
}

export function useRequestRating() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.POST('/leads/{id}/rating-request', { params: { path: { id } } })
      // 409 `not_enough_conversation` and 429 carry the sentence to show; it is used as it comes.
      if (error) throw new ApiError('Could not send the rating request.', error, (response as Response | undefined)?.status)
    },
    // Settled, not only on success: a refusal means the lead's "may I ask" answer on screen was
    // out of date (someone else asked, or the conversation is not there yet), so it is read again
    // and the button takes the state the server now gives.
    onSettled: (_data, _error, id) => queryClient.invalidateQueries({ queryKey: ['leads', id] }),
  })
}

// Paged from the newest end with "Load earlier" (review F-029) — see `useThreadMessages`, shared
// with `useClientMessages`, for the paging, the fallback poll and what `items` holds.
export function useLeadMessages(id: string | undefined) {
  return useThreadMessages('lead', id)
}

export function useSendLeadMessage(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await api.POST('/leads/{id}/messages', {
        params: { path: { id } },
        body: { content },
      })
      if (error) throw new ApiError('Could not send this message.', error)
      return data
    },
    // The answer IS the new message, so it goes straight into the thread's newest page (the
    // realtime frame for it lands in the same function and is de-duplicated there). Invalidating
    // the thread instead would refetch every page the consultant has loaded (review F-029), and
    // so would the lead's key as a prefix — only the lead itself is refreshed.
    onSuccess: (message) => {
      if (message) applyChatMessage(queryClient, { type: 'lead', id }, message)
      else queryClient.invalidateQueries({ queryKey: ['leads', id, 'messages'] })
      queryClient.invalidateQueries({ queryKey: ['leads', id], exact: true })
    },
  })
}

export function useMarkLeadRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST('/leads/{id}/read', { params: { path: { id } } })
      if (error) throw new ApiError('Could not mark this conversation read.', error)
    },
    // Exact (review F-029): `['leads', id]` is also the prefix of the thread's own key, and this
    // runs for every message that arrives while the conversation is open — as a prefix it
    // refetched every loaded page of the thread, and the lead's notes with it, each time.
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['leads', id], exact: true })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

// Paged since contract gate 7 (Wave 3 plan §7 item 3), reordered 2026-09-26 (coordinator decision)
// to page NEWEST first — a `useInfiniteQuery` feed, same shape as Client Profile's Internal Notes
// tab (`useInternalNotes`, `queries/clients.ts`), so both notes panels render chronologically with
// a "Show earlier notes" button loading OLDER pages (`chronologicalPages` in `lib/pagination.ts`).
export function useLeadNotes(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useInfiniteQuery({
    queryKey: ['leads', id, 'notes'],
    queryFn: async ({ pageParam, signal }: { pageParam: string | undefined; signal: AbortSignal }) => {
      const { data, error } = await api.GET('/leads/{id}/notes', {
        signal,
        params: { path: { id: id! }, query: { limit: 20, cursor: pageParam } },
      })
      if (error) throw new ApiError('Could not load internal notes.', error)
      return data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.next_cursor ?? undefined,
    enabled: isAuthed && Boolean(id),
  })
}

export function useAddLeadNote(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await api.POST('/leads/{id}/notes', {
        params: { path: { id } },
        body: { content },
      })
      if (error) throw new ApiError('Could not add this note.', error)
      return data
    },
    // Same cache-surgery as Client Profile's notes tab: the new note goes to the top of `pages[0]`
    // (always the newest page) so it renders at the bottom of the chronological list at once, with
    // no refetch.
    onSuccess: (note) =>
      queryClient.setQueryData(['leads', id, 'notes'], (old: InfiniteNotesData | undefined) => {
        if (!old || old.pages.length === 0) return old
        const [first, ...rest] = old.pages
        return {
          ...old,
          pages: [{ ...first, items: [note, ...first.items], meta: { ...first.meta, total: (first.meta.total ?? 0) + 1 } }, ...rest],
        }
      }),
  })
}

export function useSetLeadReminder(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { note: string; due_date: string; due_time: string }) => {
      const { data, error } = await api.POST('/leads/{id}/reminders', {
        params: { path: { id } },
        body,
      })
      if (error) throw new ApiError('Could not set this reminder.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activity-feed'] }),
  })
}

export function useProposeConversion() {
  const queryClient = useQueryClient()
  return useMutation({
    // T8: key minted once per modal open by the caller — see useBulkAllocateLeads.
    mutationFn: async ({ id, idempotencyKey }: { id: string; idempotencyKey: string }) => {
      const { data, error, response } = await api.POST('/leads/{id}/convert', {
        params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
      })
      if (error) throw new ApiError('Could not send the conversion proposal.', error, (response as Response | undefined)?.status)
      return data
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['leads', id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

// User-asked (2026-08-19) — the approve/decline step for a pending ConversionProposal
// (regardless of who initiated it — consultant via useProposeConversion above, or the
// student-initiated `initiated_by: 'student'` case, which has no frontend trigger of its own
// since no student login exists in this codebase). Takes the proposal id directly — the caller
// already has `lead.active_proposal` in scope, no need to re-fetch it. Returns `client_id` on
// approval so the caller can route straight to the new Client Profile.
export function useRespondToConversion(leadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ proposalId, decision }: { proposalId: string; decision: 'approved' | 'declined' }) => {
      const { data, error } = await api.POST('/conversion-proposals/{id}/respond', {
        // Required since contract gate 7 (approving opens a case): one key per answer.
        params: { path: { id: proposalId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
        body: { decision },
      })
      if (error) throw new ApiError('Could not respond to this proposal.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', leadId] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      // Responding resolves the proposal, so it must leave Activity's pending_proposals
      // (2026-08-29).
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
    },
  })
}

// The sender's side takes back a proposal nobody has answered (contract gate 12f): consultancy
// staff cancel their own offer on a lead, or a request Create Applicant sent to an existing
// student. The server answers 404 to anyone it will not let cancel, and 400 once the proposal is
// no longer pending. The key is minted once per opened confirm by the caller.
export function useCancelConversionProposal() {
  const queryClient = useQueryClient()
  const refresh = () => {
    invalidateApplicantRequests(queryClient)
    queryClient.invalidateQueries({ queryKey: ['leads'] })
    queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
  }
  return useMutation({
    mutationFn: async ({ proposalId, idempotencyKey }: { proposalId: string; idempotencyKey: string }) => {
      const { data, error, response } = await api.DELETE('/conversion-proposals/{id}', {
        params: { path: { id: proposalId }, header: { 'Idempotency-Key': idempotencyKey } },
      })
      if (error) throw new ApiError('Could not cancel this.', error, response?.status)
      return data
    },
    onSuccess: refresh,
    // A refusal means the list on screen is out of date (already answered, lapsed, or cancelled by
    // a colleague), and an "already applied" answer means the cancel landed: refresh either way.
    onError: refresh,
  })
}

// "A button in lead's detail page, request for shortlist courses" (user-requested, 2026-08-19).
export function useRequestShortlist(leadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/leads/{id}/request-shortlist', {
        params: { path: { id: leadId } },
      })
      if (error) throw new ApiError('Could not send the shortlist request.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads', leadId, 'messages'] }),
  })
}

// Course Finder's "Suggest" button, forked for a lead selection — see
// `POST /leads/{id}/suggest-course`'s own doc comment for why this is a message rather than a
// `selected_colleges` row (a lead has no journey for one to attach to).
export function useSuggestCourseToLead(leadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (courseId: string) => {
      const { data, error } = await api.POST('/leads/{id}/suggest-course', {
        params: { path: { id: leadId } },
        body: { course_id: courseId },
      })
      if (error) throw new ApiError('Could not suggest this course.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads', leadId, 'messages'] }),
  })
}
