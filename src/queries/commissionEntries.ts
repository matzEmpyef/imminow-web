import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from './auth'

/**
 * Installments — money actually received against a commission entry (2026-08-28).
 *
 * Deliberately invoice-optional: consultancies invoicing externally record installments with no
 * platform document at all, and a platform receipt is only ever a linkable reference. Both hooks
 * take the clientId purely for cache invalidation — the entry id addresses the server.
 */

function invalidateCommissionViews(queryClient: ReturnType<typeof useQueryClient>, clientId: string) {
  queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'commissions'] })
  queryClient.invalidateQueries({ queryKey: ['commission'] })
  queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
}

export function useRecordInstallment(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      entryId,
      ...body
    }: {
      entryId: string
      source: 'college' | 'student'
      amount: { amount: number; currency: string }
      received_on?: string
      note?: string
      receipt_id?: string
    }) => {
      const { data, error } = await api.POST('/commission-entries/{id}/installments', {
        params: { path: { id: entryId } },
        body,
      })
      if (error) throw new ApiError('Could not record this installment.', error)
      return data
    },
    onSuccess: () => invalidateCommissionViews(queryClient, clientId),
  })
}

export function useDeleteInstallment(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ entryId, installmentId }: { entryId: string; installmentId: string }) => {
      const { error } = await api.DELETE('/commission-entries/{id}/installments/{installmentId}', {
        params: { path: { id: entryId, installmentId } },
      })
      if (error) throw new ApiError('Could not remove this installment.', error)
    },
    onSuccess: () => invalidateCommissionViews(queryClient, clientId),
  })
}
