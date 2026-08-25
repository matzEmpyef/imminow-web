import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useAllocationRule() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['lead-allocation-rules'],
    queryFn: async () => {
      const { data, error } = await api.GET('/lead-allocation-rules')
      if (error) throw new ApiError('Could not load the allocation rule.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useUpdateAllocationRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { mode: 'manual' | 'round_robin'; participating_employee_ids: string[] }) => {
      const { data, error } = await api.PATCH('/lead-allocation-rules', { body })
      if (error) throw new ApiError('Could not update the allocation rule.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-allocation-rules'] }),
  })
}
