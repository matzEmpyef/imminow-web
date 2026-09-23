import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type Institution = components['schemas']['Institution']
export type InstitutionSuggestion = components['schemas']['InstitutionSuggestion']
export type InstitutionSuggestionGroup = components['schemas']['InstitutionSuggestionGroup']

/**
 * A near match WITH its reasoning (assumptions audit M5, product owner 2026-09-19).
 *
 * `InstitutionSuggestion.near_matches` declares `score` and `matched_tokens`; the GROUPED queue
 * carries exactly the same rows — the server builds both from one `institutionNearMatches()` — but
 * `InstitutionSuggestionGroup.near_matches` is still typed as a bare `Institution[]` in the
 * contract. This borrows the declared shape rather than inventing one, so the two cannot drift.
 */
export type InstitutionNearMatch = NonNullable<InstitutionSuggestion['near_matches']>[number]

/** Below this, a bulk resolve has to be confirmed — the server's own threshold (M5). */
export const INSTITUTION_CONFIDENT_SCORE = 60

/** The group's near matches, read as the scored rows the server actually sends (M5). */
export const nearMatchesOf = (g: InstitutionSuggestionGroup): InstitutionNearMatch[] =>
  (g.near_matches ?? []) as InstitutionNearMatch[]

/**
 * The student's own school or college — NOT `colleges`, which are destinations abroad.
 *
 * `q` matches name and city together, so "choice thiruvalla" finds the Thiruvalla Choice School
 * rather than the Kochi one. Every label must show the city for the same reason: name alone is not
 * an identity here.
 */
export function useInstitutions(q?: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['institutions', q ?? ''],
    queryFn: async () => {
      const { data, error } = await api.GET('/institutions', {
        params: { query: { q: q || undefined, limit: 100 } },
      })
      if (error) throw new ApiError('Could not load institutions.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

export interface InstitutionListFilters {
  q?: string
  type?: 'school' | 'college'
  city?: string
  state?: string
  status?: 'active' | 'retired' | 'all'
  sort?: string
  cursor?: string
  limit?: number
}

// The admin list (2026-09-11) — paged and filtered on the server; it used to be the first 100 rows.
export function useAdminInstitutions(filters: InstitutionListFilters) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['institutions', 'admin', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/institutions', { params: { query: filters } })
      if (error) throw new ApiError('Could not load institutions.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/** The platform-staff mapping queue. Its size is the honest measure of how stale institution filters are. */
export function useInstitutionSuggestions() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['institution-suggestions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/institutions/suggestions')
      if (error) throw new ApiError('Could not load the institution queue.', error)
      return data
    },
    enabled: isAuthed,
  })
}

function invalidateInstitutions(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['institutions'] })
  queryClient.invalidateQueries({ queryKey: ['institution-suggestions'] })
}

export function useCreateInstitution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: components['schemas']['InstitutionInput']) => {
      const { data, error } = await api.POST('/institutions', { body })
      if (error) throw new ApiError(error.error?.message ?? 'Could not create this institution.')
      return data
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

export function useUpdateInstitution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string
      name?: string
      city?: string
      state?: string | null
      type?: 'school' | 'college'
      active?: boolean
    }) => {
      const { data, error } = await api.PATCH('/institutions/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError(error.error?.message ?? 'Could not update this institution.')
      return data
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

export function useMergeInstitution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, intoId }: { id: string; intoId: string }) => {
      const { data, error } = await api.POST('/institutions/{id}/merge', {
        params: { path: { id } },
        body: { into_id: intoId },
      })
      if (error) throw new ApiError(error.error?.message ?? 'Could not merge these institutions.')
      return data
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

// One decision for a whole group of students who typed the same school (2026-09-11).
export function useBulkResolveInstitutionSuggestions() {
  const queryClient = useQueryClient()
  // The error type is named so callers can branch on `code` — the 409 `confirm_required` is a
  // question this page answers, not a failure it reports (assumptions audit M5, 2026-09-19).
  return useMutation<unknown, ApiError, { userIds: string[]; institutionId: string; confirm?: boolean }>({
    mutationFn: async ({
      userIds,
      institutionId,
      confirm,
    }: {
      userIds: string[]
      institutionId: string
      /**
       * Sent only after the admin has been shown the weak-match warning and said yes again
       * (assumptions audit M5, product owner 2026-09-19). A first attempt never carries it.
       */
      confirm?: boolean
    }) => {
      const { data, error } = await api.POST('/institutions/suggestions/bulk-resolve', {
        body: { user_ids: userIds, institution_id: institutionId, ...(confirm ? { confirm: true } : {}) },
      })
      // The whole envelope, not just its message (M5): the 409 is `confirm_required` and carries
      // `score` / `student_count` / `institution_name` in `details`, which is what the confirm
      // dialog is built from. Passing the message as the FALLBACK discarded both.
      if (error) throw new ApiError('Could not map these students.', error)
      return data
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

/**
 * UNDO a mapping (assumptions audit M5, product owner 2026-09-19).
 *
 * A resolve — and especially a bulk one — used to be final: setting the institution cleared the
 * text the student typed in the same move, so a wrong mapping could only be corrected by asking
 * every student to type their school again. `DELETE` restores what they typed and puts them back
 * in the queue. A student who PICKED their school from the type-ahead has no typed text to
 * restore, so they simply end up with an empty field — the honest result.
 */
export function useUnmapInstitution() {
  const queryClient = useQueryClient()
  return useMutation<void, ApiError, { userIds: string[]; note?: string }>({
    mutationFn: async ({ userIds, note }) => {
      for (const userId of userIds) {
        const { error } = await api.DELETE('/institutions/suggestions/{user_id}', {
          params: { path: { user_id: userId } },
          body: note ? { note } : {},
        })
        // 404 means this one was not mapped — nothing to undo for them, and no reason to abandon
        // the rest of the batch.
        if (error && (error as { error?: { code?: string } }).error?.code !== 'not_found') {
          throw new ApiError('Could not put this student back in the queue.', error)
        }
      }
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

export function useBulkDismissInstitutionSuggestions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userIds, note }: { userIds: string[]; note?: string }) => {
      const { data, error } = await api.POST('/institutions/suggestions/bulk-dismiss', {
        body: { user_ids: userIds, ...(note ? { note } : {}) },
      })
      if (error) throw new ApiError(error.error?.message ?? 'Could not clear these entries.')
      return data
    },
    onSuccess: () => invalidateInstitutions(queryClient),
  })
}

/**
 * How to render one. The city is baked into the stored NAME (user, 2026-08-27), so the name alone is
 * already unambiguous. Kept as a function so the rule lives in one place.
 */
export const institutionLabel = (i: Pick<Institution, 'name'>) => i.name
