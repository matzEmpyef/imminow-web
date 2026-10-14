/**
 * Where a person stands on a team (phase 8, T1-13): invited and not yet joined, working here,
 * switched off, or an invitation taken back. The roster used to show "Active" for all but the
 * switched-off, so a mistyped invitation looked like a colleague and was offered work.
 *
 * Both lists read it, so they cannot disagree: the consultancy's Employees page and the platform's
 * immiNow Users page. Each has its own source of "has this person accepted?", and each source is
 * ONE function below.
 */
export type PersonStanding = 'invited' | 'expired' | 'active' | 'withdrawn' | 'disabled'

export const STANDING_LABEL: Record<PersonStanding, string> = {
  invited: 'Invited',
  expired: 'Invitation expired',
  active: 'Active',
  withdrawn: 'Invitation withdrawn',
  disabled: 'Disabled',
}

export const STANDING_BADGE: Record<PersonStanding, 'warning' | 'success' | 'secondary'> = {
  invited: 'warning',
  expired: 'secondary',
  active: 'success',
  withdrawn: 'secondary',
  disabled: 'secondary',
}

function standingOf(active: boolean, neverJoined: boolean): PersonStanding {
  if (active) return neverJoined ? 'invited' : 'active'
  return neverJoined ? 'withdrawn' : 'disabled'
}

interface RosterRow {
  /**
   * Said by the server (T1-13): `invited` until the invitation is accepted, then `active`, or
   * `deactivated`. `invitation_expired` (fault check 9e) is an invitation left unanswered for
   * 7 days; the generated type does not list it yet (replace with generated type after the
   * contract join).
   */
  status?: 'invited' | 'invitation_expired' | 'active' | 'deactivated'
  active?: boolean
}

/**
 * A consultancy's own roster row (`GET /staff/employees`): the server says where the person stands
 * (`Employee.status`), and this only gives it words. Nothing is guessed from a sign-in time — an
 * employee who has not signed in yet is `active`, an invited one is `invited` (and holds a seat).
 * A row without a status (the frozen mock) falls back to the plain `active` switch.
 */
export function employeeStanding(employee: RosterRow): PersonStanding {
  if (employee.status === 'invited') return 'invited'
  if (employee.status === 'invitation_expired') return 'expired'
  if (employee.status === 'deactivated') return 'disabled'
  if (employee.status === 'active') return 'active'
  return employee.active === false ? 'disabled' : 'active'
}

interface DirectoryRow {
  active: boolean
  invited_at: string | null
  accepted_at: string | null
}

/**
 * A row of the platform's immiNow Users directory: invited when an invitation was sent and has not
 * been accepted. A person with no invitation on record (created before invitations existed, or
 * seeded) is not guessed to be anything but active or disabled.
 */
export function directoryStanding(row: DirectoryRow): PersonStanding {
  return standingOf(row.active, Boolean(row.invited_at) && !row.accepted_at)
}
