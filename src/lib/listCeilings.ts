import { useMyConsultancy } from '@/queries/consultancy'

// The ceilings on a consultancy's bounded lists (product owner, 2026-09-25; build reference 1.15):
// 100 tags, 50 designations (the protected ones included) and 100 branches (active and inactive
// together). The numbers are the SERVER's — `Consultancy.limits` on the consultancy's own record —
// so nothing here hard-codes 100 or 50. Partner colleges have no ceiling and are deliberately not a
// kind here.
export type CeilingKind = 'tags' | 'designations' | 'branches'

const NOUNS: Record<CeilingKind, { one: string; many: string }> = {
  tags: { one: 'tag', many: 'tags' },
  designations: { one: 'designation', many: 'designations' },
  branches: { one: 'branch', many: 'branches' },
}

export interface CeilingState {
  /** "12 of 100 tags" — shown beside the create action. */
  label: string
  atLimit: boolean
  /** Why creating is off, e.g. "You've reached the 100-tag limit." — set only at the ceiling. */
  reason?: string
}

/**
 * The count against the ceiling, or null when either side is unknown (the list or the
 * consultancy is still loading, or the record carries no `limits` — nothing is then disabled,
 * because a create the console can't judge is the server's to refuse).
 */
export function ceilingState(kind: CeilingKind, count: number | undefined, limit: number | undefined): CeilingState | null {
  if (count === undefined || limit === undefined) return null
  const noun = NOUNS[kind]
  const atLimit = count >= limit
  return {
    label: `${count} of ${limit} ${limit === 1 ? noun.one : noun.many}`,
    atLimit,
    reason: atLimit ? `You've reached the ${limit}-${noun.one} limit.` : undefined,
  }
}

export function useListCeiling(kind: CeilingKind, count: number | undefined): CeilingState | null {
  const consultancy = useMyConsultancy()
  return ceilingState(kind, count, consultancy.data?.limits?.[kind])
}
