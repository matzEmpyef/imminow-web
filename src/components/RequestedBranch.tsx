import { Badge } from '@/components/Badge'

/**
 * WHICH BRANCH THE STUDENT ASKED TO TALK TO (product owner, 2026-09-21) — `preferred_branch_id` on
 * a lead and, carried across the conversion, on a client.
 *
 * It is NOT the servicing branch. `branch_id` is the servicing branch, is stamped from whoever the
 * case is assigned to, and is what the money is attributed against; this is a wish the student
 * typed in before anyone at the consultancy had seen them. Nothing routes on it — a lead carrying
 * one is allocated exactly like a lead without one.
 *
 * That distinction is the whole reason this is one shared piece rather than a string written out
 * three times: "Branch: North Campus" and "Branch: Head Office" on the same screen, with no words
 * saying which is which, is how a consultant comes to believe the platform assigned something.
 */
export const REQUESTED_BRANCH_HINT =
  'The branch this student asked to talk to when they started the chat. A preference, not a routing rule — nothing is assigned from it, so honour it yourself when you can.'

export function RequestedBranchBadge({ name }: { name?: string | null }) {
  if (!name) return <span className="text-text-secondary">—</span>
  return (
    <Badge color="info" title={REQUESTED_BRANCH_HINT}>
      {name}
    </Badge>
  )
}

/** The one-line explanation, for a list where the column alone would read as an assignment. */
export function RequestedBranchNote() {
  return (
    <p className="text-body-sm text-text-secondary">
      <span className="font-medium text-text-primary">Requested branch</span> is what the student asked for when they
      started the chat. Nothing is routed from it &mdash; it is there so you can honour it when you decide who takes
      them.
    </p>
  )
}
