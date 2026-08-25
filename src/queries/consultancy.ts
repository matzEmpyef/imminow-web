import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type Consultancy = components['schemas']['Consultancy']

export function useMyConsultancy() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['consultancy', 'me'],
    queryFn: async () => {
      const { data, error } = await api.GET('/consultancies/me')
      if (error) throw new ApiError('Could not load consultancy details.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 5 * 60 * 1000,
  })
}

type ConsultancyProfileEdits = Partial<
  Pick<
    Consultancy,
    'logo_url' | 'description' | 'about_us' | 'countries_served' | 'city' | 'country' | 'public_email' | 'public_phone'
  >
>

// Incoming-transfer codes (build reference 1.18, reworked 2026-08-20: the RECEIVING consultancy
// mints the code — "do not involve immiNow admin"). Listed and issued from Consultancy
// Management's Incoming Transfers tab.
export function useTransferCodes(enabled: boolean) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['transfer-codes'],
    queryFn: async () => {
      const { data, error } = await api.GET('/transfer-codes')
      if (error) throw new ApiError('Could not load transfer codes.', error)
      return data
    },
    enabled: isAuthed && enabled,
  })
}

export function useIssueTransferCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { student_email: string; reason: string }) => {
      const { data, error } = await api.POST('/transfer-codes', { body })
      if (error) throw new ApiError('Could not issue a transfer code.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transfer-codes'] }),
  })
}

export function useUpdateConsultancyProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ConsultancyProfileEdits) => {
      const { data, error } = await api.PATCH('/consultancies/me', { body })
      if (error) throw new ApiError('Could not update the consultancy profile.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultancy', 'me'] }),
  })
}

export function useRequestUpgrade(consultancyId: string) {
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/consultancies/{id}/upgrade-request', {
        params: { path: { id: consultancyId } },
      })
      if (error) throw new ApiError('Could not send the upgrade request.', error)
    },
  })
}
