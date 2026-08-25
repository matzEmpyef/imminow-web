import { useAuthStore } from '@/stores/authStore'
import { useEmployees, useDesignations } from '@/queries/staff'

// The six permission areas and their granular sub-permissions, build reference 1.15. Shared
// between DesignationsPage (editing a template's baseline) and EmployeesPage (editing an
// individual's overrides on top of that baseline) so the two checklists never drift apart.
export interface PermissionDef {
  key: string
  label: string
}

export interface PermissionGroup {
  key: string
  label: string
  permissions: PermissionDef[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'leads',
    label: 'Leads',
    permissions: [
      { key: 'leads.view_own', label: 'View own leads' },
      { key: 'leads.view_all', label: 'View all leads' },
      { key: 'leads.reassign', label: 'Reassign leads' },
      { key: 'leads.allocate_from_pool', label: 'Allocate from pool' },
      { key: 'leads.import', label: 'Import leads' },
      { key: 'leads.edit_self_sourced', label: 'Edit self-sourced leads' },
      { key: 'leads.delete', label: 'Delete leads' },
      { key: 'leads.close', label: 'Close leads' },
    ],
  },
  {
    key: 'clients',
    label: 'Clients & Plans',
    permissions: [
      { key: 'clients.view_own', label: 'View own clients' },
      { key: 'clients.view_all', label: 'View all clients' },
      { key: 'clients.reassign', label: 'Reassign or switch consultant' },
      // Restored 2026-08-20 (user: Transfer Applicant is needed alongside Transfer Consultant,
      // "just that Transfer Applicant should not be that accessible") — gates the buried
      // cross-consultancy transfer at the bottom of Client Profile's Overview.
      { key: 'clients.transfer_applicant', label: 'Transfer applicant to another consultancy' },
      { key: 'clients.create_applicant', label: 'Create applicant manually' },
      { key: 'clients.edit_plan', label: 'Edit plan' },
      { key: 'clients.assign_template', label: 'Assign template' },
      { key: 'clients.view_commissions', label: 'View Commissions tab' },
      { key: 'clients.close', label: 'Close clients' },
    ],
  },
  {
    key: 'step_review',
    label: 'Step Review',
    permissions: [
      { key: 'step_review.confirm_send_back', label: 'Confirm / send back' },
      { key: 'step_review.reopen_plan', label: 'Reopen plan' },
    ],
  },
  {
    key: 'settings',
    label: 'Consultancy Settings',
    permissions: [
      { key: 'settings.edit_profile', label: 'Edit profile' },
      { key: 'settings.manage_templates', label: 'Manage templates' },
      { key: 'settings.manage_course_suggestions', label: 'Manage course suggestions' },
    ],
  },
  {
    key: 'staff',
    label: 'Staff Administration',
    permissions: [
      { key: 'staff.manage_employees', label: 'Manage employees' },
      { key: 'staff.manage_designations', label: 'Manage designations' },
      { key: 'staff.manage_branches', label: 'Manage branches' },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    permissions: [
      { key: 'billing.view_commission_details', label: 'View Commission Details' },
      { key: 'billing.export_statements', label: 'Export statements' },
    ],
  },
]

// User-requested (2026-08-15) — the frontend had no way to check "does the logged-in user
// actually have permission X," so every gated action so far was tier-only (e.g. Transfer
// Applicant's Ultimate-tier check). Mirrors the mock server's own `effectivePermission()`
// exactly (admin always-on bypass, then the employee's own override, falling back to their
// designation's baseline) — there's no dedicated "my permissions" endpoint, so this is computed
// from the same Manage Access data that edits it.
// Resolves any number of permission keys from ONE pair of queries. `usePermission` can't be called
// in a loop (hook rules) and the sidebar needs a different key per link, so the lookup is exposed
// as a plain function over already-fetched data instead.
//
// `can` FAILS CLOSED — with no resolved employee every key answers false. That's the right
// default for hiding an action, but it means a false answer has three very different causes, and
// a caller that renders a *message* has to tell them apart:
//
//   isLoading  — queries in flight. Nothing is known yet; hold a skeleton.
//   isError    — the queries FAILED. Nothing is known and nothing will be; this is a network
//                problem, NOT a permission decision. Rendering "you don't have access" here
//                states a denial the server never made (frontend audit, 2026-08-25 — the exact
//                mirror of the flash-of-denial bug `isLoading` was added to prevent).
//   neither    — queries succeeded and the user genuinely has no employee row / no such
//                permission. This is the only case where a denial is a true statement.
//
// Actions that merely hide themselves (`usePermission` at ~13 call sites) can ignore the
// distinction: failing closed on an unknown is correct for a button. Only gates that render
// denial copy need `isError`.
export function usePermissionChecker(): {
  can: (key: string) => boolean
  isLoading: boolean
  isError: boolean
  refetch: () => void
} {
  const user = useAuthStore((s) => s.user)
  const employees = useEmployees()
  const designations = useDesignations()
  const employee = employees.data?.items.find((e) => e.user!.id === user?.id)
  const can = (key: string): boolean => {
    if (!employee) return false
    if (employee.is_consultancy_admin) return true
    const overrides = employee.permission_overrides ?? {}
    if (key in overrides) return overrides[key]
    const designation = designations.data?.find((d) => d.id === employee.designation_id)
    return designation?.permissions?.[key] ?? false
  }
  return {
    can,
    isLoading: employees.isLoading || designations.isLoading,
    // Deliberately NOT `employees.isError || designations.isError`. React Query reports isError
    // for a failed BACKGROUND refetch too, while keeping the previous data — and in that case we
    // can still answer every key correctly from cache. Surfacing raw isError would blank a
    // perfectly working page on a transient blip, which is a worse bug than the one this is
    // fixing. The question that actually matters is "did a failure leave me with nothing to
    // answer from", so each source is checked for error AND absent data.
    isError: (employees.isError && !employees.data) || (designations.isError && !designations.data),
    // Both, unconditionally: either one may be the failed half, and refetching an already-good
    // query is a cheap no-op against its cache.
    refetch: () => {
      void employees.refetch()
      void designations.refetch()
    },
  }
}

export function usePermission(key: string): boolean {
  return usePermissionChecker().can(key)
}
