import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function usePlatformStaff() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['platform-staff'],
    queryFn: async () => {
      const { data, error } = await api.GET('/platform-staff')
      if (error) throw new ApiError('Could not load platform staff.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreatePlatformStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; email: string; permissions?: Record<string, boolean> }) => {
      const { data, error } = await api.POST('/platform-staff', { body })
      if (error) throw new ApiError('Could not send this invite.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-staff'] }),
  })
}

// Sends a fresh 7-day link (2026-09-11). 409 once they've already accepted — the drawer only
// offers this action for `invited` rows in the first place, but the server is the real guard.
export function useResendPlatformStaffInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST('/platform-staff/{id}/resend-invite', { params: { path: { id } } })
      if (error) throw new ApiError('Could not resend the invite.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-staff'] }),
  })
}

// A reason is mandatory since 2026-09-11 (build reference 1.24) — kept in the audit log alongside
// which flags changed. `reason` travels in the same body as the flags themselves, not a separate
// param, matching what the server's PATCH accepts.
export function useUpdatePlatformStaffPermissions(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    // Flags and reason are passed apart and joined here: typed as one object they made an
    // impossible type (a string `reason` under a boolean index signature) that `tsc -b` — the
    // production build — rejected (2026-09-12). The wire body stays flat, as the server expects.
    mutationFn: async ({ flags, reason }: { flags: Record<string, boolean>; reason: string }) => {
      const body = { ...flags, reason }
      const { data, error } = await api.PATCH('/platform-staff/{id}/permissions', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update permissions.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-staff'] }),
  })
}

// Replaces the old DELETE-based disable (2026-09-11): POST /disable now requires a reason, refuses
// a Super Admin (409 super_admin) and refuses your own account (409 self), on top of the existing
// already-disabled guard.
export function useDisablePlatformStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/platform-staff/{id}/disable', { params: { path: { id } }, body: { reason } })
      if (error) throw new ApiError('Could not disable this account.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-staff'] }),
  })
}

// Someone disabled before they ever accepted their invite comes back as `invited`, not `active`
// (server-decided — build reference 1.24).
export function useEnablePlatformStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/platform-staff/{id}/enable', { params: { path: { id } }, body: { reason } })
      if (error) throw new ApiError('Could not enable this account.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-staff'] }),
  })
}
