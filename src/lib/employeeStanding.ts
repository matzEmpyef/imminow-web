/**
 * Where a person stands on a team (phase 8, T1-13): invited and not yet joined, working here,
 * switched off, or an invitation taken back. The roster used to show "Active" for all but the
 * switched-off, so a mistyped invitation looked like a colleague and was offered work.
 *
 * Both lists read it, so they cannot disagree: the consultancy's Employees page and the platform's
 * immiNow Users page. Each has its own source of "has this person accepted?", and each source is
 * ONE function below, so the day the server serves a status of its own there is one line to change.
 */
export type PersonStanding = 'invited' | 'active' | 'withdrawn' | 'disabled'

export const STANDING_LABEL: Record<PersonStanding, string> = {
  invited: 'Invited',
  active: 'Active',
  withdrawn: 'Invitation withdrawn',
  disabled: 'Disabled',
}

export const STANDING_BADGE: Record<PersonStanding, 'warning' | 'success' | 'secondary'> = {
  invited: 'warning',
  active: 'success',
  withdrawn: 'secondary',
  disabled: 'secondary',
}

function standingOf(active: boolean, neverJoined: boolean): PersonStanding {
  if (active) return neverJoined ? 'invited' : 'active'
  return neverJoined ? 'withdrawn' : 'disabled'
}

interface RosterRow {
  active?: boolean
  detail?: string
  user?: { last_login_at?: string | null } | null
}

/**
 * A consultancy's own roster row (`GET /staff/employees`). The row carries no invitation status,
 * so "has not joined" is read as "has never signed in": accepting an invitation signs the person
 * straight in, and an invitation reserves no account until then.
 *
 * WAITING ON THE SERVER: this is the one line to switch when `Employee` serves its own status
 * (expected `Employee.status: 'invited' | 'active' | 'deactivated'`, as the freelancer and platform
 * team rows already do). A summary row (what a colleague without staff management sees) carries no
 * sign-in time at all, so it says nothing either way.
 */
export function employeeStanding(employee: RosterRow): PersonStanding {
  const neverJoined = employee.detail !== 'summary' && !employee.user?.last_login_at
  return standingOf(employee.active !== false, neverJoined)
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
