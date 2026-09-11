/**
 * Small formatting helpers shared between ComplaintsPage and DisputesPage (2026-09-11 rebuild).
 */

// "3 days" / "Today" — the Age column's own form, distinct from lib/time's relativeTime ("3d
// ago"): the spec for this table calls for the plain-English noun form specifically.
export function ageLabel(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  return `${days} day${days === 1 ? '' : 's'}`
}

export function plural(n: number | undefined | null, noun: string): string {
  const count = n ?? 0
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
