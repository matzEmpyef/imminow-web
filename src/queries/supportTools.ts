import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useUserSearch(q: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['user-search', q],
    queryFn: async () => {
      const { data, error } = await api.GET('/users/search', { params: { query: { q } } })
      if (error) throw new ApiError('Could not search users.', error)
      return data
    },
    enabled: isAuthed && q.trim().length > 0,
  })
}

export function useExportUserData() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/users/{id}/export', { params: { path: { id } } })
      if (error) throw new ApiError('Could not generate a data export.', error)
      return data
    },
  })
}

// The escalation behind the guardian flow (2026-09-05): a 16- or 17-year-old whose parent
// declined twice, or who mistyped an address and used their one retry, cannot send another link
// themselves. Support can, and doing so clears the decline count — that IS the point of the
// escalation. Mandatory reason, audit-logged, like every other action on this page.
export function useResendGuardianLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      reason,
      guardian_name,
      email,
      phone,
    }: {
      id: string
      reason: string
      guardian_name?: string
      email?: string
      phone?: string
    }) => {
      const { data, error } = await api.POST('/users/{id}/guardian-consent/resend', {
        params: { path: { id } },
        body: { reason, guardian_name, email, phone },
      })
      if (error) throw new ApiError('Could not send the guardian link again.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-search'] }),
  })
}

export function useUpdateUserEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, new_email, reason }: { id: string; new_email: string; reason: string }) => {
      const { data, error } = await api.POST('/users/{id}/email', {
        params: { path: { id } },
        body: { new_email, reason },
      })
      if (error) throw new ApiError('Could not update this email.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-search'] }),
  })
}

export function useEraseUserData() {
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/users/{id}/erase', { params: { path: { id } }, body: { reason } })
      if (error) throw new ApiError(error.error.message)
      return data
    },
  })
}

export function useSwitchConsultancy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      journeyId,
      new_consultancy_id,
      reason,
    }: {
      journeyId: string
      new_consultancy_id: string
      reason: string
    }) => {
      const { data, error } = await api.POST('/journeys/{id}/switch-consultancy', {
        params: { path: { id: journeyId } },
        body: { new_consultancy_id, reason },
      })
      if (error) throw new ApiError('Could not switch this student to a new consultancy.', error)
      return data
    },
    // H8 fix (frontend review, 1 Sep 2026): a switch used to invalidate nothing, so the journey's
    // lists/detail/dashboard kept showing the OLD consultancy until staleTime or a manual reload.
    onSuccess: (_data, { journeyId }) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['clients', journeyId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['user-search'] })
    },
  })
}
