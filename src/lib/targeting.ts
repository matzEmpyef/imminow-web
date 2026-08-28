import type { components } from '../api/schema'

export type Targeting = components['schemas']['Targeting']

/**
 * True when any dimension is actually restricted — for the "this reaches everyone" warnings, and
 * for deciding whether to store a targeting object at all rather than a null.
 *
 * Lives here rather than beside TargetingFilter because a module that exports both a component and
 * a plain function breaks React Fast Refresh (oxlint react/only-export-components).
 */
export function hasAnyTargeting(t: Targeting | null | undefined): boolean {
  if (!t) return false
  return Object.values(t).some((v) => (Array.isArray(v) ? v.length > 0 : v != null))
}
