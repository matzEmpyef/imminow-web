/**
 * Shared formatting for the Visit Requests page and drawer (2026-09-12 rebuild).
 */

/** "3 days" / "5h" / "<1h" — warns (≥24h) once it crosses into whole days. `null` means replied. */
export function waitingLabel(hours: number | null | undefined): { text: string; warn: boolean } {
  if (hours == null) return { text: '—', warn: false }
  if (hours < 1) return { text: '<1h', warn: false }
  if (hours < 24) return { text: `${Math.round(hours)}h`, warn: false }
  const days = Math.round(hours / 24)
  return { text: `${days} ${days === 1 ? 'day' : 'days'}`, warn: true }
}

// One "Waiting" column used to carry two different clocks at once — how long the consultancy has
// sat on the reply, and how close the actual visit is — with nothing to tell them apart. A request
// replied to yesterday for a visit tomorrow, and one nobody has answered for a visit next week,
// both used to read as just "Waiting 1 day." Split into two explicit clocks (product review,
// 2026-09-12).

/** "Waiting 5h for a reply" / "Waiting 3 days for a reply" — `null` once the consultancy has replied. */
export function replyWaitingLabel(hours: number | null | undefined): { text: string; warn: boolean } {
  if (hours == null) return { text: 'Replied', warn: false }
  if (hours < 1) return { text: 'Waiting <1h for a reply', warn: false }
  if (hours < 24) return { text: `Waiting ${Math.round(hours)}h for a reply`, warn: false }
  const days = Math.round(hours / 24)
  return { text: `Waiting ${days} ${days === 1 ? 'day' : 'days'} for a reply`, warn: true }
}

/** "Visit in 4 days" / "Visit today" / "Visit date passed" — from the proposed date alone, no time. */
export function visitDateLabel(proposedDate: string): { text: string; warn: boolean } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const visit = new Date(proposedDate)
  visit.setHours(0, 0, 0, 0)
  const days = Math.round((visit.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return { text: 'Visit date passed', warn: true }
  if (days === 0) return { text: 'Visit today', warn: true }
  return { text: `Visit in ${days} ${days === 1 ? 'day' : 'days'}`, warn: false }
}
