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
      idempotencyKey,
      ...body
    }: {
      entryId: string
      /** Per-modal-open key (gate 11): a retry of the same submit replays instead of double-recording. */
      idempotencyKey?: string
      source: 'college' | 'student'
      amount: { amount: number; currency: string }
      received_on?: string
      note?: string
      receipt_id?: string
    }) => {
      const { data, error } = await api.POST('/commission-entries/{id}/installments', {
        params: { path: { id: entryId }, header: { 'Idempotency-Key': idempotencyKey ?? crypto.randomUUID() } },
        body,
      })
      if (error) throw new ApiError('Could not record this installment.', error)
      return data
    },
    onSuccess: () => invalidateCommissionViews(queryClient, clientId),
  })
}

/**
 * Voids a mis-entered installment (gate 11, F14) — it replaces the old DELETE: the row is never
 * removed, it stays in the money record marked void with who/why. 409 `part_settled` when a payment
 * is already allocated to the installment's share part (void that payment first), 409
 * `entry_not_active` when the entry itself was voided or reversed.
 */
export function useVoidInstallment(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      entryId,
      installmentId,
      reason,
      idempotencyKey,
    }: {
      entryId: string
      installmentId: string
      reason: string
      idempotencyKey?: string
    }) => {
      const { data, error } = await api.POST('/commission-entries/{id}/installments/{installmentId}/void', {
        params: {
          path: { id: entryId, installmentId },
          header: { 'Idempotency-Key': idempotencyKey ?? crypto.randomUUID() },
        },
        body: { reason },
      })
      if (error) throw new ApiError('Could not void this installment.', error)
      return data
    },
    onSuccess: () => invalidateCommissionViews(queryClient, clientId),
  })
}
