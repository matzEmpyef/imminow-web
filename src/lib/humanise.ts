/**
 * The one fallback for a server value this console does not recognise.
 *
 * Assumptions audit M34 (product owner, 2026-09-19 — approved trimmed: "fix the unknown-status
 * 'no term' rendering only; no enum-serving refactor"). The console keeps hand-maintained copies
 * of several server enums, and every one of them used to resolve a miss the same wrong way: a
 * lookup that misses falls through to a NEIGHBOURING entry — `SUBSCRIPTION_BADGE[status] ??
 * SUBSCRIPTION_BADGE.none` printed "Subscription · No term" on a fully paid account whose status
 * was simply newer than this build. A label that is merely unhelpful is recoverable; a label that
 * is confidently wrong is not.
 *
 * So: a code with no entry reads as itself, tidied — `pending_review` becomes "Pending review".
 * Nobody is told anything false, and the raw code is still legible enough to search the server
 * for. Every sweep site in M34 uses this rather than its own inline title-caser.
 */
export function humaniseCode(code: string): string {
  const cleaned = code.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/** `LABELS[code] ?? humaniseCode(code)`, for the many sites that do exactly that. */
export function labelFor(labels: Record<string, string>, code: string | null | undefined): string {
  if (!code) return ''
  return labels[code] ?? humaniseCode(code)
}
