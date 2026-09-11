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
