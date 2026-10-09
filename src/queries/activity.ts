import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { toPage } from '@/lib/pagination'
import type { components } from '@/api/schema'

type ActivityTaskInput = components['schemas']['ActivityTaskInput']

// `enabled` defaults to true for ActivityPage itself; AppShell.tsx passes the `activity_queue`
// entitlement (Ultimate by default, build reference 1.16 made real 2026-08-29) so the sidebar
// badge doesn't fire this fetch on every single page load for a plan that can't even see the
// Activity link.
export function useActivityFeed(enabled = true) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['activity-feed'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/activity-feed', { signal })
      if (error) throw new ApiError('Could not load the activity feed.', error)
      return data
    },
    enabled: isAuthed && enabled,
  })
}

/**
 * Completed tasks finished before `before` (an ISO date-time), newest completed first — the ones
 * `GET /activity-feed` leaves out after 30 days (review F-112). Cursor-paged, 20 a page; `limit` is
 * always sent, since a request with neither `limit` nor `cursor` gets the old bare array.
 * `mine` narrows to the caller's own (`assigned_to_me`); without it the route serves every task
 * the caller may see: those they gave or were given, and those on a case they can work on.
 * Keyed under `['activity-tasks']`, which completing or assigning a task invalidates.
 */
export function useCompletedActivityTasks(
  { before, mine }: { before: string; mine: boolean },
  cursor?: string,
  enabled = true,
) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['activity-tasks', 'completed', before, mine, cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/activity-tasks', {
        signal,
        params: {
          query: {
            'filter[completed_before]': before,
            ...(mine ? { assigned_to_me: true } : {}),
            cursor,
            limit: 20,
          },
        },
      })
      if (error) throw new ApiError('Could not load completed tasks.', error)
      // `data` is the `{ items, meta }` envelope when `limit` is sent; the bare array of the
      // transition answer is read as one page too.
      return toPage(Array.isArray(data) ? { items: data } : data)
    },
    enabled: isAuthed && enabled,
  })
}

export function useAssignActivityTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ActivityTaskInput) => {
      const { data, error } = await api.POST('/activity-tasks', { body })
      if (error) throw new ApiError('Could not assign this task.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
      queryClient.invalidateQueries({ queryKey: ['activity-tasks'] })
    },
  })
}

export function useCompleteActivityTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/activity-tasks/{id}/complete', { params: { path: { id } } })
      if (error) throw new ApiError('Could not mark this task done.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
      queryClient.invalidateQueries({ queryKey: ['activity-tasks'] })
    },
  })
}
