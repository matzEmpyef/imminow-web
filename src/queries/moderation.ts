import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { paths } from '@/api/schema'

interface ModerationQueueFilters {
  search?: string
  kind?: 'new' | 'course_correction' | 'college_correction'
  sort?: string
  cursor?: string
  limit?: number
}

export function useModerationQueue(
  status: 'pending' | 'approved' | 'rejected' = 'pending',
  filters: ModerationQueueFilters = {},
) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['moderation-course-suggestions', status, filters],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/moderation/course-suggestions', {
        signal,
        params: {
          query: {
            filter: { status, ...(filters.kind ? { kind: filters.kind } : {}) },
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load the review queue.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// `mode`/`value` (2026-08-24) only matter for a `type: correction` suggestion — Add applies the
// consultant's own value, Add with modification applies `value` instead, and "I will add
// manually" records the suggestion as accepted without touching the course. Omitted entirely for
// `type: new`, which has no modes; the server defaults to `as_suggested` there and it is inert.
type ApproveBody = NonNullable<
  paths['/moderation/course-suggestions/{id}/approve']['post']['requestBody']
>['content']['application/json']
/** A field of a correction that is the consultant's own words or a web address (review F-096). */
export type ConfirmableField = NonNullable<ApproveBody['confirmed_fields']>[number]

export function useApproveCourseSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      mode,
      value,
      confirmedFields,
      courseId,
    }: {
      id: string
      mode?: 'as_suggested' | 'modified' | 'manual'
      value?: string
      // The free-text and link fields the reviewer ticked "Use this text" on (review F-096).
      // Only they are copied into the course; sent with `as_suggested` alone.
      confirmedFields?: ConfirmableField[]
      // type=new: the course just created from the suggestion (2026-09-11).
      courseId?: string
    }) => {
      const { data, error } = await api.POST('/moderation/course-suggestions/{id}/approve', {
        params: { path: { id } },
        body: courseId
          ? { course_id: courseId }
          : mode
            ? { mode, value, ...(mode === 'as_suggested' && confirmedFields ? { confirmed_fields: confirmedFields } : {}) }
            : undefined,
      })
      if (error) throw new ApiError('Could not approve this suggestion.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moderation-course-suggestions'] }),
  })
}

export function useRejectCourseSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/moderation/course-suggestions/{id}/reject', {
        params: { path: { id } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not reject this suggestion.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moderation-course-suggestions'] }),
  })
}
