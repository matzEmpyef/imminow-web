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
    mutationFn: async (body: { amount: number; proof_url?: string | null }) => {
      const { data, error } = await api.POST('/commission/payments', {
        params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
        body,
      })
      if (error) throw new ApiError('Could not record this payment.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commission'] }),
  })
}
