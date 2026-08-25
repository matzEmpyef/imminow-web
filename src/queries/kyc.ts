import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

/** The consultancy's own KYC state — drives the Profile tab's certificate card (2026-08-19). */
export function useMyKyc() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['kyc-me'],
    queryFn: async () => {
      const { data, error } = await api.GET('/consultancies/me/kyc')
      if (error) throw new ApiError('Could not load your KYC status.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/** Submit (or re-submit) the certificate. Re-submission resets verification server-side. */
export function useSubmitKyc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (document_url: string) => {
      const { data, error } = await api.POST('/consultancies/me/kyc', { body: { document_url } })
      if (error) throw new ApiError('Could not submit the certificate.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kyc-me'] }),
  })
}

/** Super Admin review of one consultancy's submitted certificate. */
export function useConsultancyKyc(consultancyId: string | null) {
  return useQuery({
    queryKey: ['kyc', consultancyId],
    queryFn: async () => {
      const { data, error } = await api.GET('/consultancies/{id}/kyc', {
        params: { path: { id: consultancyId! } },
      })
      if (error) throw new ApiError('Could not load the KYC record.', error)
      return data
    },
    enabled: consultancyId != null,
  })
}

/** Approve the certificate — flips the kyc_verified badge everywhere, audit-logged server-side. */
export function useVerifyKyc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (consultancyId: string) => {
      const { data, error } = await api.POST('/consultancies/{id}/kyc/verify', {
        params: { path: { id: consultancyId } },
      })
      if (error) throw new ApiError('Could not verify — has a certificate been submitted?', error)
      return data
    },
    onSuccess: (_data, consultancyId) => {
      queryClient.invalidateQueries({ queryKey: ['kyc', consultancyId] })
      queryClient.invalidateQueries({ queryKey: ['admin-consultancies'] })
    },
  })
}
