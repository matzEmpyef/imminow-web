import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type EmployeeInput = components['schemas']['EmployeeInput']
type EmployeePatchInput = components['schemas']['EmployeePatchInput']
type DesignationInput = components['schemas']['DesignationInput']
type BranchInput = components['schemas']['BranchInput']

export function useEmployees() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      // T2 (third-pass review): every consumer treats this as the COMPLETE roster (Lead Pool
      // allocate menu, seat counts) — the contract default of 20 silently truncated it at the
      // 21st employee. The mock returns everything regardless, which is why this never showed
      // in QA; the contract caps at 100 (seat ceilings top out at 50, so 100 covers every tier).
      const { data, error } = await api.GET('/staff/employees', { params: { query: { limit: 100 } } })
      if (error) throw new ApiError('Could not load employees.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useInviteEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: EmployeeInput) => {
      const { data, error } = await api.POST('/staff/employees', { body })
      if (error) throw new ApiError('Could not invite this employee.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })
}

export function useUpdateEmployee(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: EmployeePatchInput) => {
      const { data, error } = await api.PATCH('/staff/employees/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError(error.error.message)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })
}

// Disabling now revokes access AND hands the work over in one call — the server refuses to
// disable anyone still holding leads or clients without a named successor, so the two can never
// drift apart (user, 2026-08-23: "ask on deactivation whom to assign everything to").
export function useDisableEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reassign_to_employee_id }: { id: string; reassign_to_employee_id?: string }) => {
      const { error } = await api.DELETE('/staff/employees/{id}', {
        params: { path: { id } },
        body: reassign_to_employee_id ? { reassign_to_employee_id } : {},
      })
      if (error) throw new ApiError(error.error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      // The handover moves records onto someone else's list — leave the stale ones behind and
      // the reassigned work stays invisible until a manual refresh.
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}

export function useDesignations() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['designations'],
    queryFn: async () => {
      const { data, error } = await api.GET('/staff/designations')
      if (error) throw new ApiError('Could not load designations.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreateDesignation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: DesignationInput) => {
      const { data, error } = await api.POST('/staff/designations', { body })
      if (error) throw new ApiError('Could not create this designation.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['designations'] }),
  })
}

export function useUpdateDesignation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: DesignationInput) => {
      const { data, error } = await api.PATCH('/staff/designations/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError(error.error.message)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['designations'] }),
  })
}

export function useBranches() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await api.GET('/staff/branches')
      if (error) throw new ApiError('Could not load branches.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreateBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: BranchInput) => {
      const { data, error } = await api.POST('/staff/branches', { body })
      if (error) throw new ApiError('Could not create this branch.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branches'] }),
  })
}

export function useUpdateBranch(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: BranchInput) => {
      const { data, error } = await api.PATCH('/staff/branches/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this branch.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branches'] }),
  })
}
