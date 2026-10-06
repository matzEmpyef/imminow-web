import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type AppConfigUpdate = components['schemas']['AppConfigUpdate']

// GET /app-config is public on the server (the version gate must work before login), but the
// admin console only ever renders this page inside AdminShell — same "still requires an
// authenticated session to even reach the query" convention every other admin query here uses.
export function useAppConfig() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['app-config'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/app-config', { signal })
      if (error) throw new ApiError('Could not load the app configuration.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useUpdateAppConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    // Partial body (gate 12c, F64) — only what changed, plus `reason` / `force` when the minimum
    // version is raised. The 200 may carry `affected_students` (null/absent on the frozen mock).
    mutationFn: async (body: AppConfigUpdate) => {
      const { data, error } = await api.PATCH('/app-config', { body })
      if (error) throw new ApiError('Could not save the app configuration.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-config'] }),
  })
}
