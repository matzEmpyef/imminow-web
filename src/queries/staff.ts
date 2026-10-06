import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'
import { fetchEmployee, fetchEmployeePage, type Employee, type EmployeeActiveFilter } from './pickerSources'

type EmployeeInput = components['schemas']['EmployeeInput']
type EmployeePatchInput = components['schemas']['EmployeePatchInput']
type DesignationInput = components['schemas']['DesignationInput']
type BranchInput = components['schemas']['BranchInput']

/** Every write to the roster refreshes the screens' lists and what the pickers hold. */
function invalidateEmployees(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['employees'] })
  queryClient.invalidateQueries({ queryKey: ['picker', 'employees'] })
}

/**
 * The WHOLE roster, for the two screens that show all of it at once: the Employees management
 * page (`active: 'all'`, leavers included) and the allocation rule's checklist of who receives
 * leads (`'true'`, people who work here now). Follows the cursor to the end, so nobody is cut off
 * at the hundredth row (review F-036). Pickers never use this: they search on the server through
 * `employeeSource`.
 */
export function useAllEmployees(active: EmployeeActiveFilter = 'true') {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['employees', 'all', active],
    queryFn: async ({ signal }) => {
      const items: Employee[] = []
      let cursor: string | undefined
      do {
        const page = await fetchEmployeePage({ cursor, limit: 100, active, signal })
        items.push(...page.items)
        cursor = page.meta.next_cursor ?? undefined
      } while (cursor)
      return { items }
    },
    enabled: isAuthed,
  })
}

/** One colleague by id: the consultant a case is assigned to, a saved choice. */
export function useEmployee(id: string | null | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['employees', 'one', id],
    queryFn: ({ signal }) => fetchEmployee(id!, signal),
    enabled: isAuthed && Boolean(id),
  })
}

/**
 * How many people work here now: what the plan's seat limit counts (the server counts active
 * employees). One row is asked for; the answer is the list's own total.
 */
export function useActiveEmployeeCount() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['employees', 'count'],
    queryFn: async ({ signal }) => {
      const page = await fetchEmployeePage({ limit: 1, signal })
      return page.meta.total ?? page.items.length
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
    onSuccess: () => invalidateEmployees(queryClient),
  })
}

export function useUpdateEmployee(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: EmployeePatchInput) => {
      const { data, error } = await api.PATCH('/staff/employees/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this employee.', error)
      return data
    },
    onSuccess: () => invalidateEmployees(queryClient),
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
      if (error) throw new ApiError('Could not disable this employee.', error)
    },
    onSuccess: () => {
      invalidateEmployees(queryClient)
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
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/staff/designations', { signal })
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
      if (error) throw new ApiError('Could not update this designation.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['designations'] }),
  })
}

export function useBranches() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['branches'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/staff/branches', { signal })
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
    // A renamed branch is named on leads, clients and employees too (review F-156): those lists
    // kept the old name until they next reloaded on their own.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}
