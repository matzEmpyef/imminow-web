import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
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
    queryFn: async () => {
      const { data, error } = await api.GET('/activity-feed')
      if (error) throw new ApiError('Could not load the activity feed.', error)
      return data
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activity-feed'] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activity-feed'] }),
  })
}
