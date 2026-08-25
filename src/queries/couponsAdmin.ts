import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type CouponInput = components['schemas']['CouponInput']

export function useAdminCoupons() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-coupons'],
    queryFn: async () => {
      const { data, error } = await api.GET('/coupons')
      if (error) throw new ApiError('Could not load coupons.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreateCoupon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CouponInput) => {
      const { data, error } = await api.POST('/coupons', { body })
      if (error) throw new ApiError('Could not create this coupon.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-coupons'] }),
  })
}

export function useUpdateCoupon(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<CouponInput>) => {
      const { data, error } = await api.PATCH('/coupons/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this coupon.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-coupons'] }),
  })
}

// User-requested (2026-08-18) — "in Coupons - we need to see how many people claimed it." Lazily
// fetched (only once the count is actually clicked, via `enabled`), same pattern as
// useEventAttendance/useQuizLeaderboard.
export function useCouponRedemptions(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['coupon-redemptions', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/coupons/{id}/redemptions', { params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load redemptions.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}
