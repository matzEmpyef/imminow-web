import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from './auth'

function invalidateStepRelated(queryClient: ReturnType<typeof useQueryClient>, clientId?: string) {
  queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
  if (clientId) {
    queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'plan'] })
    queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
    queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'activity'] })
  }
  queryClient.invalidateQueries({ queryKey: ['clients'] })
}

export function useApproveStep(clientId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (stepId: string) => {
      const { data, error } = await api.POST('/steps/{id}/approve', { params: { path: { id: stepId } } })
      if (error) throw new ApiError('Could not approve this step.', error)
      return data
    },
    onSuccess: () => invalidateStepRelated(queryClient, clientId),
  })
}

export function useRejectStep(clientId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ stepId, reason }: { stepId: string; reason: string }) => {
      const { data, error } = await api.POST('/steps/{id}/reject', {
        params: { path: { id: stepId } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not send this step back.', error)
      return data
    },
    onSuccess: () => invalidateStepRelated(queryClient, clientId),
  })
}
