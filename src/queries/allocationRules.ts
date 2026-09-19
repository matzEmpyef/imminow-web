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
    // `capacity_per_consultant` — null means "the platform figure" (assumptions audit C11,
    // approved 2026-09-19). Sent on every save, including as null, so clearing the field actually
    // clears the ceiling rather than leaving the last one in place.
    mutationFn: async (body: {
      mode: 'manual' | 'round_robin'
      participating_employee_ids: string[]
      capacity_per_consultant?: number | null
    }) => {
      const { data, error } = await api.PATCH('/lead-allocation-rules', { body })
      if (error) throw new ApiError('Could not update the allocation rule.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-allocation-rules'] }),
  })
}
