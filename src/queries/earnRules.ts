import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useEarnRules() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['earn-rules'],
    queryFn: async () => {
      const { data, error } = await api.GET('/points/earn-rules')
      if (error) throw new ApiError('Could not load earn rules.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useUpdateEarnRule(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { points_value?: number; cap?: number | null; active?: boolean }) => {
      const { data, error } = await api.PATCH('/points/earn-rules/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this rule.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['earn-rules'] }),
  })
}
