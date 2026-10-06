import { humaniseCode } from '@/lib/humanise'
import { useMe } from '@/queries/me'

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
      // Console review C2 (2026-09-13) — the server now enforces this one key on BOTH
      // POST /clients/{id}/close and POST /leads/{id}/close, so the label says so.
      { key: 'clients.close', label: 'Close leads and cases' },
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
      { key: 'billing.record_payment', label: 'Record payments (installments & platform payments)' },
      { key: 'billing.export_statements', label: 'Export statements' },
    ],
  },
]

/**
 * The six groups above PLUS anything the server is already storing that this build has never
 * heard of (assumptions audit M34, product owner 2026-09-19 — the "an unknown server value must
 * not render as something false" sweep).
 *
 * `PERMISSION_GROUPS` is a hand-kept copy of the server's own list, so a permission added
 * server-side simply did not appear in either checklist: a designation that HELD it read as not
 * holding it, and the next save — which posts the whole map — was the only warning anyone got.
 * An unrecognised key now gets its own row, labelled with the raw key humanised, because there is
 * nothing truer to call it. Both checklists (designation baseline and employee overrides) call
 * this, so the two can never disagree about what exists.
 */
export function permissionGroupsFor(...keySources: (Record<string, boolean> | undefined | null)[]): PermissionGroup[] {
  const known = new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)))
  const extra = [...new Set(keySources.flatMap((source) => Object.keys(source ?? {})))]
    .filter((key) => !known.has(key))
    .sort()
  if (extra.length === 0) return PERMISSION_GROUPS
  return [
    ...PERMISSION_GROUPS,
    {
      key: '__unknown',
      label: 'Other permissions on this account',
      permissions: extra.map((key) => ({ key, label: humaniseCode(key) })),
    },
  ]
}

/**
 * The checklist an editor shows once the plan is taken into account (product owner, 2026-09-25;
 * build reference 1.15): ONLY the keys in `Consultancy.available_permissions`, in that order. A
 * permission is left out there when every action it controls needs a plan feature the consultancy
 * doesn't have, and the server keeps whatever tick is stored for it — so an editor that never
 * shows it, and never sends it, is what keeps it intact for after an upgrade.
 *
 * Grouped under the same headings as `PERMISSION_GROUPS`, each group appearing where its first
 * available key does; a served key this build has no label for gets the humanised-key row
 * `permissionGroupsFor` already uses (M34). `available` undefined — a record without the field —
 * falls back to `permissionGroupsFor`, the pre-gate-5 behaviour.
 */
export function visiblePermissionGroups(
  available: readonly string[] | undefined,
  ...keySources: (Record<string, boolean> | undefined | null)[]
): PermissionGroup[] {
  if (!available) return permissionGroupsFor(...keySources)
  const groupOf = new Map<string, { group: PermissionGroup; perm: PermissionDef }>()
  for (const group of PERMISSION_GROUPS) for (const perm of group.permissions) groupOf.set(perm.key, { group, perm })
  const result: PermissionGroup[] = []
  const byKey = new Map<string, PermissionGroup>()
  for (const key of new Set(available)) {
    const known = groupOf.get(key)
    const groupKey = known ? known.group.key : '__unknown'
    let group = byKey.get(groupKey)
    if (!group) {
      group = known
        ? { key: known.group.key, label: known.group.label, permissions: [] }
        : { key: '__unknown', label: 'Other permissions on this account', permissions: [] }
      byKey.set(groupKey, group)
      result.push(group)
    }
    group.permissions.push(known ? known.perm : { key, label: humaniseCode(key) })
  }
  return result
}

/** Every key a checklist shows, flattened — what an editor's save is limited to. */
export function permissionKeys(groups: PermissionGroup[]): string[] {
  return groups.flatMap((g) => g.permissions.map((p) => p.key))
}

/** `map` narrowed to `keys` — keys absent from `map` stay absent (an override map is sparse). */
export function pickPermissions(map: Record<string, boolean> | undefined | null, keys: string[]): Record<string, boolean> {
  const source = map ?? {}
  return Object.fromEntries(keys.filter((k) => k in source).map((k) => [k, source[k]]))
}

/**
 * Why a protected designation (Owner/Admin, Full access — build reference 1.15) has no edit or
 * delete: shown in its read-only viewer and as its badge's tooltip. The server refuses any edit
 * 409 `protected_designation`.
 */
export function protectedDesignationReason(name: string): string {
  return `${name} is built in, so it can't be edited or deleted.`
}

/**
 * Why the designation someone is on opens read-only for them (review F-146). A holder of "manage
 * designations" could otherwise tick more permissions onto their own designation, raising
 * themselves; the server refuses it (403), in these words. The Owner/Admin already holds
 * everything and edits any designation.
 */
export const OWN_DESIGNATION_REASON = 'You cannot edit the designation you are on. Ask the Owner/Admin.'

/** True when `designationId` is the caller's own and the caller is not the Owner/Admin. */
export function isOwnDesignation(
  staff: { is_admin?: boolean; designation_id?: string | null } | null | undefined,
  designationId: string | null | undefined,
): boolean {
  return Boolean(staff && !staff.is_admin && designationId && staff.designation_id === designationId)
}

/**
 * The plan's visible permission keys, from `GET /me` (`staff.available_permissions`: the same
 * list as `Consultancy.available_permissions`). Undefined until `/me` has answered, and for anyone
 * who is not consultancy or institute staff.
 */
export function useAvailablePermissions(): string[] | undefined {
  return useMe().data?.staff?.available_permissions
}

// "May the signed-in person do X" — answered by the server (review F-036, 2026-10-06).
//
// Until then this hook downloaded the employee list and the designations, found its own row and
// re-applied the override-then-designation rule. The employee list is paged at 100, oldest first,
// leavers included, so the newest staff of a consultancy that had ever had more than 100 employees
// were not in it: every key answered false and they lost every screen. `GET /me` returns the
// caller's own permission keys, decided by the same code that decides `permission_denied`, so
// there is nothing left to re-derive: `can(key)` is "is the key in the list".
//
// An Owner/Admin holds every key, so the old "admin bypass" is simply the server's answer now.
// A key that is held but whose plan feature is off is still in `permissions`; an action that
// needs a plan feature checks `useFeature` as well (show it only when BOTH say yes).
//
// `can` FAILS CLOSED — with no answer every key is false. That's the right default for hiding an
// action, but it means a false answer has three very different causes, and a caller that renders
// a *message* has to tell them apart:
//
//   isLoading  — `/me` is in flight. Nothing is known yet; hold a skeleton.
//   isError    — `/me` FAILED and left nothing to answer from. This is a network problem, NOT a
//                permission decision. Rendering "you don't have access" here states a denial the
//                server never made (frontend audit, 2026-08-25).
//   neither    — the server answered and the caller genuinely lacks the permission (or is not
//                staff at all). This is the only case where a denial is a true statement.
//
// Actions that merely hide themselves (`usePermission`) can ignore the distinction: failing closed
// on an unknown is correct for a button. Only gates that render denial copy need `isError`.
export function usePermissionChecker(): {
  can: (key: string) => boolean
  /**
   * The caller is the consultancy's Owner/Admin (`staff.is_admin`) — for the few things no
   * permission key can grant, such as the audit log (review F-021). Never `user.role`. Fails
   * closed like `can`: false while loading and when the check failed.
   */
  isAdmin: boolean
  isLoading: boolean
  isError: boolean
  refetch: () => void
} {
  const me = useMe()
  const staff = me.data?.staff
  return {
    can: (key: string): boolean => staff?.permissions.includes(key) ?? false,
    isAdmin: staff?.is_admin === true,
    isLoading: me.isLoading,
    // Deliberately NOT bare `me.isError`. React Query reports isError for a failed BACKGROUND
    // refetch too, while keeping the previous answer — and then every key can still be answered
    // from it. Blanking a working page on a transient blip is a worse bug than the one this
    // prevents, so the question is "did a failure leave nothing to answer from".
    isError: me.isError && !me.data,
    refetch: () => {
      void me.refetch()
    },
  }
}

export function usePermission(key: string): boolean {
  return usePermissionChecker().can(key)
}
