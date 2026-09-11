import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { FINANCE_QUERY_KEY } from './financeDashboard'
import type { components } from '@/api/schema'

export type CommissionPayment = components['schemas']['CommissionPayment']

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
//
// `receivedAmount`/`note` (2026-09-11): what actually arrived can now differ from what the
// consultancy declared — omit both to confirm the declared amount as-is (BulkConfirmModal's
// path), or pass a different receivedAmount with a note when Finance received something else.
export function useConfirmCommissionPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      paymentId,
      receivedAmount,
      note,
    }: {
      paymentId: string
      receivedAmount?: number
      note?: string
    }) => {
      const hasBody = receivedAmount != null || Boolean(note)
      const { data, error } = await api.PATCH('/commission/payments/{id}/confirm', {
        params: { path: { id: paymentId } },
        ...(hasBody ? { body: { received_amount: receivedAmount, note } } : {}),
      })
      if (error) throw new ApiError('Could not confirm this payment.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission'] })
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
      queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
    },
  })
}

// Corrects the amount received on an already-confirmed payment (finance permission, 2026-09-11) —
// money that bounced, a bank reversal, a figure caught wrong after the fact. The old figure moves
// onto the payment's `corrections`; zero records that nothing actually arrived. The consultancy is
// notified. Same wide invalidation as confirm/reject — a corrected amount changes every total that
// counts confirmed payments.
export function useCorrectCommissionPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ paymentId, amount, reason }: { paymentId: string; amount: number; reason: string }) => {
      const { data, error } = await api.POST('/commission/payments/{id}/correct', {
        params: { path: { id: paymentId } },
        body: { amount, reason },
      })
      if (error) throw new ApiError('Could not correct this payment.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission'] })
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
      queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
    },
  })
}

// Turns down a declared payment with a reason (finance permission, 2026-09-11) — the consultancy
// is notified with the reason and can declare again. Same wide invalidation as confirm: a rejected
// payment leaves the awaiting queue and lands in Payment History, which both need to reflect it at
// once.
export function useRejectCommissionPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: string; reason: string }) => {
      const { data, error } = await api.POST('/commission/payments/{id}/reject', {
        params: { path: { id: paymentId } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not reject this payment.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission'] })
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
      queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
    },
  })
}
