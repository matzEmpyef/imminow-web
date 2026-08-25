import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// Platform Admin Complaints queue (build reference 1.27, user-approved 2026-08-20) — student
// dispute reports raised from the Sentpo app's low-prominence "Report a problem" entry.
export function useAdminComplaints(status: string | null) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['complaints', status],
    queryFn: async () => {
      const { data, error } = await api.GET('/complaints', {
        params: { query: status ? { filter: { status } } : {} },
      })
      if (error) throw new ApiError('Could not load complaints.')
      return data
    },
    enabled: isAuthed,
  })
}

export function useUpdateComplaint(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { status?: 'in_review' | 'resolved'; resolution_note?: string }) => {
      const { data, error } = await api.PATCH('/complaints/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this complaint.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['complaints'] }),
  })
}
