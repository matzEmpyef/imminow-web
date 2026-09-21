export interface BranchAccess {
  /** Every branch this person may work in, in the order the branches list shows them. */
  branchIds: string[]
  /** Which of `branchIds` their leads and clients are filed under. '' when they cover none. */
  primaryId: string
}

/**
 * Ticking or unticking one branch, with the primary kept honest.
 *
 * The server refuses a `primary_branch_id` that is not among the request's own `branch_ids` (422,
 * nothing written), and separately re-derives a primary that has been removed to `branch_ids[0]`.
 * Both rules are mirrored here so the console can never put forward the invalid pairing in the
 * first place, and so unticking someone's primary branch does the same thing on screen that the
 * server would have done behind it.
 */
export function toggleBranch(access: BranchAccess, id: string, order: string[]): BranchAccess {
  const has = access.branchIds.includes(id)
  const next = has
    ? access.branchIds.filter((b) => b !== id)
    : [...access.branchIds, id].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  if (next.includes(access.primaryId)) return { branchIds: next, primaryId: access.primaryId }
  // Either the primary was just unticked, or nothing was primary yet — fall back to the first
  // covered branch, which is exactly what the server does when `primary_branch_id` is omitted.
  return { branchIds: next, primaryId: next[0] ?? '' }
}

/** What the form blocks on. Belt and braces: `toggleBranch` above should make it unreachable. */
export function primaryBranchError(access: BranchAccess): string | undefined {
  if (access.branchIds.length === 0) return undefined
  if (!access.primaryId) return 'Choose which branch is primary.'
  if (!access.branchIds.includes(access.primaryId)) return 'The primary branch has to be one of the ticked branches.'
  return undefined
}

/** True once the coverage or the primary differs from what is stored on the employee. */
export function branchAccessChanged(next: BranchAccess, stored: BranchAccess): boolean {
  return next.branchIds.join(',') !== stored.branchIds.join(',') || next.primaryId !== stored.primaryId
}
