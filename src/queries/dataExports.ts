import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

export type ExportRequest = components['schemas']['ExportRequest']

const MY_EXPORTS_KEY = ['my-exports'] as const

/**
 * The signed-in person's own copies of their data (gate 12f): newest first, at most five, any
 * role. While one is being prepared the list is read again every few seconds, so "Being prepared"
 * turns into a Download button without a reload.
 */
export function useMyExports() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: MY_EXPORTS_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET('/me/exports')
      if (error) throw new ApiError('Could not load your copies.', error)
      return data
    },
    enabled: isAuthed,
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'queued' || item.status === 'processing') ? 10_000 : false,
  })
}

/**
 * Ask for a copy of my data. It is built in the background; the account's verified email is told
 * when it is ready, and it is downloaded from here within 7 days (the mail carries no link).
 *
 * Refused 409 with the server's own sentence: `email_unverified`, `export_on_hold`
 * (`details.available_at`), `conflict` (an erasure is pending).
 */
export function useRequestMyExport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST('/profile/export')
      if (error) throw new ApiError('Could not request a copy of your data.', error, (response as Response | undefined)?.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_EXPORTS_KEY }),
  })
}

/**
 * A download link for one finished copy. It works for a few minutes (`expires_in_seconds`), so it
 * is asked for at the moment of the click and never kept. 404 unknown; 409 `conflict` not ready
 * yet; 410 `gone` past its download period (the list is read again, so the row stops offering it).
 */
export function useDownloadMyExport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await api.POST('/me/exports/{id}/download', { params: { path: { id } } })
      if (error || !data) throw new ApiError('Could not get your download.', error, (response as Response | undefined)?.status)
      return data
    },
    onError: () => queryClient.invalidateQueries({ queryKey: MY_EXPORTS_KEY }),
  })
}
