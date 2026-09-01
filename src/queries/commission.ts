import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useCommission() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['commission'],
    queryFn: async () => {
      const { data, error } = await api.GET('/commission')
      if (error) throw new ApiError('Could not load commission details.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useRecordCommissionPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    // The caller supplies the idempotency key (N7, second-pass review) — minting one here made
    // every attempt a distinct operation, defeating the header's entire purpose for double-submits.
    mutationFn: async ({
      idempotencyKey,
      ...body
    }: {
      commission_entry_id: string
      amount: number
      transaction_id?: string | null
      idempotencyKey: string
    }) => {
      const { data, error } = await api.POST('/commission/payments', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body,
      })
      if (error) throw new ApiError('Could not record this payment.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commission'] }),
  })
}

// Super Admin marks a declared payment as actually received (finance permission) — the
// declared → confirmed transition. Confirmed payments feed the consultancy's running total and
// the admin dashboard's revenue chart, hence the wide invalidation.
export function useConfirmCommissionPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await api.PATCH('/commission/payments/{id}/confirm', {
        params: { path: { id: paymentId } },
      })
      if (error) throw new ApiError('Could not confirm this payment.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission'] })
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
    },
  })
}
