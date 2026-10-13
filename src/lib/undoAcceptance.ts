import { useMeStaff } from '@/lib/me'
import type { MeStaff } from '@/queries/me'

/** The permission key that lets staff undo a college acceptance on a client they are not assigned to. */
export const REVERT_ACCEPTANCE_PERMISSION = 'clients.revert_acceptance'

/**
 * Who is offered "Undo acceptance" (DECISIONS 117 C-13; Phase 8): the consultancy's admin, the
 * consultant the client is assigned to, or anyone holding `clients.revert_acceptance`. Anyone else
 * who can open the client would be refused (403), so the button is not shown to them. Fails closed
 * until the signed-in person is known.
 */
export function canUndoAcceptance(
  staff: Pick<MeStaff, 'is_admin' | 'employee_id' | 'permissions'> | null | undefined,
  assignedEmployeeId: string | null | undefined,
): boolean {
  if (!staff) return false
  if (staff.is_admin) return true
  if (assignedEmployeeId && staff.employee_id === assignedEmployeeId) return true
  return staff.permissions.includes(REVERT_ACCEPTANCE_PERMISSION)
}

export function useCanUndoAcceptance(assignedEmployeeId: string | null | undefined): boolean {
  return canUndoAcceptance(useMeStaff(), assignedEmployeeId)
}
