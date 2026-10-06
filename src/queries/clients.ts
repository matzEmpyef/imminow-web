import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { applyChatMessage } from '@/lib/realtime/queryCache'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { FINANCE_QUERY_KEY } from './financeDashboard'
import { refreshStanding } from './standing'
import { useThreadMessages } from './threadMessages'
import { invalidateApplicantRequests, type ApplicantRequest } from './applicantRequests'
import { isAlreadyApplied } from '@/lib/useIdempotencyKey'
import type { components } from '@/api/schema'

type InternalNote = components['schemas']['InternalNote']
type NotesPage = { items: InternalNote[]; meta: components['schemas']['PaginatedMeta'] }
type InfiniteNotesData = { pages: NotesPage[]; pageParams: (string | undefined)[] }

interface ClientListFilters {
  assignedToMe?: boolean
  unattended?: boolean
  unassigned?: boolean
  tag?: string[]
  showClosed?: boolean
  country?: string[]
  destination?: string[]
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useClients(filters: ClientListFilters = {}, options: { enabled?: boolean } = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', filters],
    queryFn: async ({ signal }) => {
      const filter: Record<string, string> = {}
      if (filters.assignedToMe !== undefined) filter.assigned_to_me = String(filters.assignedToMe)
      if (filters.unattended !== undefined) filter.unattended = String(filters.unattended)
      if (filters.unassigned !== undefined) filter.unassigned = String(filters.unassigned)
      if (filters.tag?.length) filter.tag = filters.tag.join(',')
      if (filters.showClosed !== undefined) filter.show_closed = String(filters.showClosed)
      if (filters.country?.length) filter.country = filters.country.join(',')
      if (filters.destination?.length) filter.destination = filters.destination.join(',')

      const { data, error } = await api.GET('/clients', {
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
      if (error) throw new ApiError('Could not load clients.', error)
      return data
    },
    enabled: isAuthed && (options.enabled ?? true),
  })
}

export function useClient(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', id],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/clients/{id}', { signal, params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load this client.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}

type Client = components['schemas']['Client']

/**
 * What Create Applicant did (contract gate 12f), decided by the HTTP status alone: 201 made a new
 * person's account and case; 202 found that the email or phone belongs to an existing Sentpo
 * student, made nothing, and asked the student to accept in the app.
 */
export type CreateApplicantResult =
  | { kind: 'created'; client: Client }
  | { kind: 'requested'; request: ApplicantRequest }

export function useCreateApplicant() {
  const queryClient = useQueryClient()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['clients'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    invalidateApplicantRequests(queryClient)
  }
  return useMutation({
    // `date_of_birth` is required (assumptions audit C9, approved 2026-09-19) — this was the one
    // door a student record came through with no date of birth, and an account without one was
    // treated as an adult by every age decision on the platform.
    mutationFn: async ({
      idempotencyKey,
      ...body
    }: {
      first_name: string
      last_name: string
      email: string
      date_of_birth: string
      phone?: string | null
      address?: string | null
      case_type: 'student' | 'pr'
      assigned_employee_id: string
      idempotencyKey: string
    }): Promise<CreateApplicantResult> => {
      const { data, error, response } = await api.POST('/clients', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body,
      })
      if (error) throw new ApiError('Could not create this applicant.', error, response?.status)
      // The status says which of the two documented bodies this is; the types cannot.
      if (response.status === 202) return { kind: 'requested', request: data as ApplicantRequest }
      return { kind: 'created', client: data as Client }
    },
    onSuccess: refresh,
    // The write already went through (the first answer was lost): refresh what success refreshes.
    onError: (err) => {
      if (isAlreadyApplied(err)) refresh()
    },
  })
}

export function useSetClientTags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      const { data, error } = await api.PATCH('/clients/{id}/tags', {
        params: { path: { id } },
        body: { tags },
      })
      if (error) throw new ApiError('Could not update tags for this client.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export function useSetClientBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, branchId }: { id: string; branchId: string }) => {
      const { data, error } = await api.PATCH('/clients/{id}/branch', {
        params: { path: { id } },
        body: { branch_id: branchId },
      })
      if (error) throw new ApiError('Could not update the branch for this client.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      refreshStanding(queryClient)
    },
  })
}

// User-requested (2026-08-19) — "consultant has to select country finalized to apply." Its own
// mutation, separate from the general client PATCH, mirroring the dedicated
// PATCH /clients/{id}/finalized-country endpoint.
export function useSetFinalizedCountry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, country }: { id: string; country: string | null }) => {
      const { data, error } = await api.PATCH('/clients/{id}/finalized-country', {
        params: { path: { id } },
        body: { country },
      })
      if (error) throw new ApiError('Could not update the finalized country for this client.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
}

// Cross-consultancy Transfer Applicant (restored 2026-08-20) — closes the journey as
// closed_switched, so on success the client drops out of the default list.
export function useTransferApplicant(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { newConsultancyId: string; reason: string; transferCode: string }) => {
      const { error } = await api.POST('/clients/{id}/transfer', {
        // Required since contract gate 7 (transfer execution): one key per attempt.
        params: { path: { id: clientId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
        body: { new_consultancy_id: input.newConsultancyId, reason: input.reason, transfer_code: input.transferCode },
      })
      // The server's own message is what a consultant needs to read here — e.g. 409
      // `case_has_accepted_college` ("close the case or raise a dispute instead") or `case_moved`
      // on a stale tab. This used to drop the response body entirely and always show the generic
      // transfer-code fallback below, whatever actually went wrong (2026-09-24 fix).
      if (error)
        throw new ApiError(
          'Could not transfer this applicant. Check the transfer code — it must be issued by the receiving consultancy for this exact student.',
          error,
        )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      refreshStanding(queryClient)
    },
  })
}

export function useAssignClient(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (assignedEmployeeId: string) => {
      const { data, error } = await api.PATCH('/clients/{id}/assign', {
        params: { path: { id: clientId } },
        body: { assigned_employee_id: assignedEmployeeId },
      })
      if (error) throw new ApiError('Could not assign this client.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      refreshStanding(queryClient)
    },
  })
}

export function useApplications(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'applications'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/clients/{id}/applications', {
        signal,
        params: { path: { id: clientId! } },
      })
      if (error) throw new ApiError('Could not load selected colleges.', error)
      return data
    },
    enabled: isAuthed && Boolean(clientId),
  })
}

type CollegeStatus = 'considering' | 'applied' | 'offer_received' | 'accepted' | 'rejected'

export function useAddApplication(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    // No status: a consultant's add is by definition a SUGGESTION (user decision, 2026-08-28) —
    // the server births every row `suggested`, and only the student's own save to Dream Courses
    // turns it into a selected college.
    // `message_student` (Course Finder, 2026-09-10) also posts the course into the client's chat.
    // `campus_id` (2026-09-16): required by the server when the course runs at more than one
    // campus, assigned by it when there is exactly one.
    mutationFn: async (body: { course_id: string; campus_id?: string; message_student?: boolean }) => {
      const { data, error } = await api.POST('/clients/{id}/applications', {
        params: { path: { id: clientId } },
        body,
      })
      if (error) throw new ApiError('Could not add this college.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'applications'] })
      // A new suggested/considering row can feed Activity's ready_to_apply (2026-08-29).
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
    },
  })
}

type Money = { amount: number; currency: string }

export interface AcceptCommissionBody {
  expected_from_college?: Money
  expected_from_student?: Money
  course_start: { month: string; year: number }
}

export function useUpdateApplication(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      applicationId,
      status,
      commission,
    }: {
      applicationId: string
      status: CollegeStatus
      // Required by the server when status is 'accepted' — the Accept popup's money agreement.
      commission?: AcceptCommissionBody
    }) => {
      const { data, error } = await api.PATCH('/clients/{id}/applications/{applicationId}', {
        params: { path: { id: clientId, applicationId } },
        body: { status, ...(commission ? { commission } : {}) },
      })
      if (error) throw new ApiError('Could not update this college.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'applications'] })
      // The client's case_summary counts accepted colleges, and Close Case reads it to say
      // whether the case closes as a success — stale, it told the consultant "failure" right
      // after they had accepted a college (found 2026-09-10).
      queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
      // Accepting creates the commission entry, so every money view is downstream of this.
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'commissions'] })
      queryClient.invalidateQueries({ queryKey: ['commission'] })
      queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
      // A status move can enter/leave offers_awaiting_decision (2026-08-29).
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
    },
  })
}

export function useRevertAcceptance(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicationId, reason }: { applicationId: string; reason: string }) => {
      const { data, error } = await api.POST('/clients/{id}/applications/{applicationId}/revert-acceptance', {
        params: { path: { id: clientId, applicationId } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not revert this acceptance.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'applications'] })
      // Same reason as accepting: case_summary.accepted drops, and Close Case must see it.
      queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'commissions'] })
      queryClient.invalidateQueries({ queryKey: ['commission'] })
      queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
      // Reverting puts the row back at offer_received (2026-08-29).
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
    },
  })
}

// PR cases only — no colleges, the consultant records the agreed contribution directly.
export function useCreatePrCommissionEntry(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { amount: Money; destination_country: string; note?: string }) => {
      const { data, error } = await api.POST('/clients/{id}/commission-entry', {
        params: { path: { id: clientId } },
        body,
      })
      if (error) throw new ApiError('Could not record the contribution.', error)
      return data
    },
    onSuccess: () => {
      // case_summary.contribution_recorded flips, and Close Case reads it (2026-09-10).
      queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'commissions'] })
      queryClient.invalidateQueries({ queryKey: ['commission'] })
      queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
    },
  })
}

interface CursorPageFilters {
  cursor?: string
  limit?: number
}

// Paged since contract gate 7 (Wave 3 plan §7 item 3), reordered 2026-09-26 (coordinator decision)
// to page NEWEST first — a `useInfiniteQuery` feed rather than the console's Previous/Next paging,
// so the panel can render chronologically with a "Show earlier notes" button loading OLDER pages,
// the way chat threads work (`chronologicalPages` in `lib/pagination.ts` does the reversal).
export function useInternalNotes(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useInfiniteQuery({
    queryKey: ['clients', clientId, 'notes'],
    queryFn: async ({ pageParam, signal }: { pageParam: string | undefined; signal: AbortSignal }) => {
      const { data, error } = await api.GET('/clients/{id}/notes', {
        signal,
        params: { path: { id: clientId! }, query: { limit: 20, cursor: pageParam } },
      })
      if (error) throw new ApiError('Could not load internal notes.', error)
      return data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.next_cursor ?? undefined,
    enabled: isAuthed && Boolean(clientId),
  })
}

export function useAddInternalNote(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await api.POST('/clients/{id}/notes', {
        params: { path: { id: clientId } },
        body: { content },
      })
      if (error) throw new ApiError('Could not add this note.', error)
      return data
    },
    // The feed pages newest-first, so a note just added belongs at the top of `pages[0]` (the
    // first-fetched — always the newest — page), not appended at the end of whatever page happens
    // to be loaded last. Written straight into the cache instead of invalidating: the panel then
    // renders it at the bottom of the chronological list immediately, with no refetch.
    onSuccess: (note) =>
      queryClient.setQueryData(['clients', clientId, 'notes'], (old: InfiniteNotesData | undefined) => {
        if (!old || old.pages.length === 0) return old
        const [first, ...rest] = old.pages
        return {
          ...old,
          pages: [{ ...first, items: [note, ...first.items], meta: { ...first.meta, total: (first.meta.total ?? 0) + 1 } }, ...rest],
        }
      }),
  })
}

// Paged since contract gate 7 (newest first, `created_at` then `id`) — replaces the temporary
// `fetchAllPages` read (Wave 3 plan §7 item 3).
export function useClientActivity(clientId: string | undefined, filters: CursorPageFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'activity', filters],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/clients/{id}/activity', {
        signal,
        params: { path: { id: clientId! }, query: { limit: filters.limit ?? 20, cursor: filters.cursor } },
      })
      if (error) throw new ApiError('Could not load activity.', error)
      return data
    },
    enabled: isAuthed && Boolean(clientId),
  })
}

export function useCommissions(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'commissions'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/clients/{id}/commissions', {
        signal,
        params: { path: { id: clientId! } },
      })
      if (error) throw new ApiError('Could not load commission details.', error)
      return data
    },
    enabled: isAuthed && Boolean(clientId),
  })
}

// Paged from the newest end with "Load earlier" (review F-029) — see `useThreadMessages`, shared
// with `useLeadMessages`. For a converted client the earlier pages run on into the `session_break`
// marker and the origin lead's conversation.
export function useClientMessages(clientId: string | undefined) {
  return useThreadMessages('client', clientId)
}

export function useSendClientMessage(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await api.POST('/clients/{id}/messages', {
        params: { path: { id: clientId } },
        body: { content },
      })
      if (error) throw new ApiError('Could not send this message.', error)
      return data
    },
    // Into the newest page rather than a refetch of every loaded page — see `useSendLeadMessage`.
    onSuccess: (message) => {
      if (message) applyChatMessage(queryClient, { type: 'client', id: clientId }, message)
      else queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'messages'] })
      // The chat drawer's row for this conversation shows its last message (review F-156). The
      // live connection updates it when it is up; without it the preview stayed a message behind.
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useMarkClientRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST('/clients/{id}/read', { params: { path: { id } } })
      if (error) throw new ApiError('Could not mark this conversation read.', error)
    },
    // Exact (review F-029) — as a prefix this refetched the thread's every loaded page, and the
    // client's plans, applications, commissions, notes, documents and activity, for one read
    // marker. See `useMarkLeadRead`.
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['clients', id], exact: true })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useReopenPlan(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data, error } = await api.POST('/clients/{id}/reopen', {
        params: { path: { id: clientId } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not reopen this plan.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
    },
  })
}

function invalidateClients(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['clients'] })
}

/**
 * Every neutral reason a case can end. Each is a FACT about the case, never a verdict on the
 * student — "they would not cooperate" is an accusation and belongs in `useRaiseIssue` below,
 * which opens mediation instead of ending someone's case by assertion.
 */
export const CLOSE_SUB_REASONS = [
  { value: 'rejected_by_colleges', label: 'Rejected by the colleges' },
  { value: 'visa_refused', label: 'Visa refused' },
  { value: 'student_withdrew', label: 'Student withdrew' },
  { value: 'lost_contact', label: 'Lost contact with the student' },
  { value: 'other', label: 'Something else' },
] as const

export type CloseSubReason = (typeof CLOSE_SUB_REASONS)[number]['value']

export function useCloseClient() {
  const queryClient = useQueryClient()
  return useMutation({
    // `studentJoined` is the explicit answer the outcome now derives from when the case has an
    // acceptance (assumptions audit C6, approved 2026-09-19). Before it, the outcome was inferred
    // from the sub-reason list, and `other` — the catch-all a cancelled programme or a family
    // emergency lands in — was NOT on the did-not-go list, so immiNow invoiced commission on a
    // student who never went. Omitted entirely for a case with nothing to join; the server
    // answers 422 `student_joined_required` when it is needed and missing.
    mutationFn: async ({
      id,
      reason,
      subReason,
      studentJoined,
    }: {
      id: string
      reason: string
      subReason?: CloseSubReason
      studentJoined?: boolean
    }) => {
      const { data, error } = await api.POST('/clients/{id}/close', {
        params: { path: { id } },
        body: {
          reason,
          ...(subReason ? { sub_reason: subReason } : {}),
          ...(studentJoined === undefined ? {} : { student_joined: studentJoined }),
        },
      })
      if (error) throw new ApiError('Could not close this client.', error)
      return data
    },
    onSuccess: (_data, { id }) => {
      invalidateClients(queryClient)
      queryClient.invalidateQueries({ queryKey: ['clients', id] })
      refreshStanding(queryClient)
    },
  })
}

/**
 * Raise an issue — deliberately NOT a close. The case freezes for platform mediation; only the
 * platform decides how it ends.
 */
export function useRaiseIssue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/clients/{id}/raise-issue', {
        params: { path: { id } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not raise this issue.', error)
      return data
    },
    onSuccess: (_data, { id }) => {
      invalidateClients(queryClient)
      queryClient.invalidateQueries({ queryKey: ['clients', id] })
      refreshStanding(queryClient)
    },
  })
}

export function useReopenClientCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await api.POST('/clients/{id}/reopen-case', { params: { path: { id } } })
      if (error) throw new ApiError('Could not reopen this client.', error, (response as Response | undefined)?.status)
      return data
    },
    onSuccess: (_data, id) => {
      invalidateClients(queryClient)
      queryClient.invalidateQueries({ queryKey: ['clients', id] })
      refreshStanding(queryClient)
    },
  })
}
