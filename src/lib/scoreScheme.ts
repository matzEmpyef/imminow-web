import { humaniseCode } from './humanise'

/**
 * How an academic score is measured, printed beside the number — ALWAYS (assumptions audit M38,
 * product owner 2026-09-19).
 *
 * "8.5" on a student's education row and "8.5" on a course's minimum are not the same claim: one
 * may be a CGPA out of 10, the other out of 4, and the two look identical on screen. Every
 * surface used to print the bare figure and add `%` only when the scheme happened to be
 * `percentage` — so a CGPA and a percentage were indistinguishable, and a missing scheme was
 * silently read as a percentage (`SCHEME_SUFFIX[scheme ?? 'percentage']`).
 *
 * One function, used wherever a score prints, so the two screens can never disagree again.
 * A scheme this build does not recognise names itself rather than printing no unit at all
 * (M34's raw-string fallback).
 */
const SCORE_SCHEME_SUFFIX: Record<string, string> = {
  percentage: '%',
  cgpa_10: ' CGPA / 10',
  cgpa_4: ' CGPA / 4',
}

/** The unit to append to a score. `''` only when the scheme is genuinely absent. */
export function scoreSchemeSuffix(scheme: string | null | undefined): string {
  if (!scheme) return ''
  return SCORE_SCHEME_SUFFIX[scheme] ?? ` ${humaniseCode(scheme)}`
}

/**
 * A score with its scheme, or the score followed by an explicit "scheme not recorded" when the
 * scheme is missing. Never guesses. Returns `null` when there is no score to print at all.
 */
export function formatScore(score: number | null | undefined, scheme: string | null | undefined): string | null {
  if (score == null) return null
  return scheme ? `${score}${scoreSchemeSuffix(scheme)}` : `${score} (scale not recorded)`
}
