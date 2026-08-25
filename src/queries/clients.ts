import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

interface ClientListFilters {
  assignedToMe?: boolean
  unattended?: boolean
  tag?: string
  showClosed?: boolean
  country?: string
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useClients(filters: ClientListFilters = {}, options: { enabled?: boolean } = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', filters],
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.assignedToMe !== undefined) filter.assigned_to_me = String(filters.assignedToMe)
      if (filters.unattended !== undefined) filter.unattended = String(filters.unattended)
      if (filters.tag) filter.tag = filters.tag
      if (filters.showClosed !== undefined) filter.show_closed = String(filters.showClosed)
      if (filters.country) filter.country = filters.country

      const { data, error } = await api.GET('/clients', {
        params: {
          query: {
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load clients.')
      return data
    },
    enabled: isAuthed && (options.enabled ?? true),
  })
}

export function useClient(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/clients/{id}', { params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load this client.')
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}

export function useCreateApplicant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      first_name: string
      last_name: string
      email: string
      phone?: string | null
      address?: string | null
      case_type: 'student' | 'pr'
      assigned_employee_id: string
    }) => {
      const { data, error } = await api.POST('/clients', { body })
      if (error) throw new ApiError('Could not create this applicant.')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useSetClientTags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      const { data, error } = await api.PATCH('/clients/{id}/tags', {
        params: { path: { id } },
        body: { tags },
      })
      if (error) throw new ApiError('Could not update tags for this client.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export function useUpdateClientDetails() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, address, phone }: { id: string; address?: string | null; phone?: string | null }) => {
      const { data, error } = await api.PATCH('/clients/{id}', {
        params: { path: { id } },
        body: { address, phone },
      })
      if (error) throw new ApiError('Could not update this client.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export function useSetClientBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, branchId }: { id: string; branchId: string }) => {
      const { data, error } = await api.PATCH('/clients/{id}/branch', {
        params: { path: { id } },
        body: { branch_id: branchId },
      })
      if (error) throw new ApiError('Could not update the branch for this client.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
}

// User-requested (2026-08-19) — "consultant has to select country finalized to apply." Its own
// mutation, separate from useUpdateClientDetails above, mirroring the dedicated
// PATCH /clients/{id}/finalized-country endpoint.
export function useSetFinalizedCountry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, country }: { id: string; country: string | null }) => {
      const { data, error } = await api.PATCH('/clients/{id}/finalized-country', {
        params: { path: { id } },
        body: { country },
      })
      if (error) throw new ApiError('Could not update the finalized country for this client.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
}

// Cross-consultancy Transfer Applicant (restored 2026-08-20) — closes the journey as
// closed_switched, so on success the client drops out of the default list.
export function useTransferApplicant(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { newConsultancyId: string; reason: string; transferCode: string }) => {
      const { error } = await api.POST('/clients/{id}/transfer', {
        params: { path: { id: clientId } },
        body: { new_consultancy_id: input.newConsultancyId, reason: input.reason, transfer_code: input.transferCode },
      })
      if (error)
        throw new ApiError(
          'Could not transfer this applicant. Check the transfer code — it must be issued by the receiving consultancy for this exact student.',
        )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export function useAssignClient(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (assignedEmployeeId: string) => {
      const { data, error } = await api.PATCH('/clients/{id}/assign', {
        params: { path: { id: clientId } },
        body: { assigned_employee_id: assignedEmployeeId },
      })
      if (error) throw new ApiError('Could not assign this client.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export function useSelectedColleges(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'selected-colleges'],
    queryFn: async () => {
      const { data, error } = await api.GET('/clients/{id}/selected-colleges', {
        params: { path: { id: clientId! } },
      })
      if (error) throw new ApiError('Could not load selected colleges.')
      return data
    },
    enabled: isAuthed && Boolean(clientId),
  })
}

type CollegeStatus = 'considering' | 'applied' | 'offer_received' | 'accepted' | 'rejected'

export function useAddSelectedCollege(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { course_id: string; status: CollegeStatus }) => {
      const { data, error } = await api.POST('/clients/{id}/selected-colleges', {
        params: { path: { id: clientId } },
        body,
      })
      if (error) throw new ApiError('Could not add this college.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'selected-colleges'] }),
  })
}

export function useUpdateSelectedCollege(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ collegeId, status }: { collegeId: string; status: CollegeStatus }) => {
      const { data, error } = await api.PATCH('/clients/{id}/selected-colleges/{collegeId}', {
        params: { path: { id: clientId, collegeId } },
        body: { status },
      })
      if (error) throw new ApiError('Could not update this college.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'selected-colleges'] }),
  })
}

export function useInternalNotes(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'notes'],
    queryFn: async () => {
      const { data, error } = await api.GET('/clients/{id}/notes', {
        params: { path: { id: clientId! } },
      })
      if (error) throw new ApiError('Could not load internal notes.')
      return data
    },
    enabled: isAuthed && Boolean(clientId),
  })
}

export function useAddInternalNote(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await api.POST('/clients/{id}/notes', {
        params: { path: { id: clientId } },
        body: { content },
      })
      if (error) throw new ApiError('Could not add this note.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'notes'] }),
  })
}

export function useClientActivity(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'activity'],
    queryFn: async () => {
      const { data, error } = await api.GET('/clients/{id}/activity', {
        params: { path: { id: clientId! } },
      })
      if (error) throw new ApiError('Could not load activity.')
      return data
    },
    enabled: isAuthed && Boolean(clientId),
  })
}

export function useCommissions(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'commissions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/clients/{id}/commissions', {
        params: { path: { id: clientId! } },
      })
      if (error) throw new ApiError('Could not load commission details.')
      return data
    },
    enabled: isAuthed && Boolean(clientId),
  })
}

export function useClientMessages(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'messages'],
    queryFn: async () => {
      const { data, error } = await api.GET('/clients/{id}/messages', {
        params: { path: { id: clientId! } },
      })
      if (error) throw new ApiError('Could not load messages.')
      return data
    },
    enabled: isAuthed && Boolean(clientId),
    refetchInterval: 5000,
  })
}

export function useSendClientMessage(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await api.POST('/clients/{id}/messages', {
        params: { path: { id: clientId } },
        body: { content },
      })
      if (error) throw new ApiError('Could not send this message.')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'messages'] })
    },
  })
}

export function useMarkClientRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST('/clients/{id}/read', { params: { path: { id } } })
      if (error) throw new ApiError('Could not mark this conversation read.')
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['clients', id] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useReopenPlan(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data, error } = await api.POST('/clients/{id}/reopen', {
        params: { path: { id: clientId } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not reopen this plan.')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'plan'] })
    },
  })
}

function invalidateClients(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['clients'] })
}

export function useCloseClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/clients/{id}/close', {
        params: { path: { id } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not close this client.')
      return data
    },
    onSuccess: (_data, { id }) => {
      invalidateClients(queryClient)
      queryClient.invalidateQueries({ queryKey: ['clients', id] })
    },
  })
}

export function useReopenClientCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/clients/{id}/reopen-case', { params: { path: { id } } })
      if (error) throw new ApiError('Could not reopen this client.')
      return data
    },
    onSuccess: (_data, id) => {
      invalidateClients(queryClient)
      queryClient.invalidateQueries({ queryKey: ['clients', id] })
    },
  })
}
