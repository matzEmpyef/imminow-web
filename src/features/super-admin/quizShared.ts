// Split out of QuizAdminPage.tsx (Phase 3 plan, Tier B3, 2026-09-03) — pure movement unless noted.
import type { components } from '@/api/schema'
import type { AspectRequirement } from '@/lib/imageAspect'

export type Event = components['schemas']['Event']
export type QuizQuestionInput = components['schemas']['QuizQuestionInput']
export type PositionPrize = components['schemas']['PositionPrize']
export type QuizLeaderboardEntry = components['schemas']['QuizLeaderboardEntry']

export const MIN_OPTIONS = 4
export const MAX_OPTIONS = 6

export function emptyQuestion(): QuizQuestionInput {
  return { text: '', options: ['', '', '', ''], correct_option: 0 }
}

export function emptyPrize(position: number): PositionPrize {
  return { position, prize: '', points: undefined }
}

/** The server's limits on one prize row (review F-018). */
export const PRIZE_POINTS_MAX = 100_000
export const PRIZE_TEXT_MAX = 200

/** One prize row as the form holds it: a number field that has been cleared holds text, not a number. */
export type PrizeDraft = {
  position: number | string
  prize?: string | null
  points?: number | string | null
}

function isBlank(value: number | string | null | undefined): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '')
}

/**
 * The prize list as it is SENT (review F-018, design 7.3). The form used to post its own state,
 * so a cleared number field went out as text, an untouched row went out as a prize, and "0 points"
 * went out as a prize of nothing. The every-minute job that pays prizes could not read such a
 * list, and one bad quiz stopped prizes and reminders for all of them. So, before anything is sent:
 *
 *   - position is a number;
 *   - points is a number, or null when the field is blank or 0 (never "" and never 0);
 *   - prize is the trimmed text, or null when there is none;
 *   - a row with neither a prize nor points is not a prize, and is dropped.
 */
export function cleanPrizes(prizes: readonly PrizeDraft[]): PositionPrize[] {
  return prizes
    .map((p) => {
      const prize = typeof p.prize === 'string' ? p.prize.trim() : ''
      const points = isBlank(p.points) ? null : Number(p.points)
      return { position: Number(p.position), prize: prize === '' ? null : prize, points: points === 0 ? null : points }
    })
    .filter((p) => p.prize != null || p.points != null)
}

/**
 * Why this prize list cannot be saved, in words, or undefined when it can. The same rules the
 * server enforces (400 `validation_failed` naming `position_prizes[i]`), checked first so the
 * admin is told beside the list instead of after a round trip. Reads the list as it will be sent.
 */
export function prizeListError(prizes: readonly PrizeDraft[]): string | undefined {
  const cleaned = cleanPrizes(prizes)
  const seen = new Set<number>()
  for (const p of cleaned) {
    if (!Number.isInteger(p.position) || p.position < 1) {
      return 'Each prize needs a position: a whole number, 1 or higher.'
    }
    if (seen.has(p.position)) {
      return `Position ${p.position} has more than one prize. Each position can have only one.`
    }
    seen.add(p.position)
    if (p.points != null && (!Number.isInteger(p.points) || p.points < 1 || p.points > PRIZE_POINTS_MAX)) {
      return `Bonus points for position ${p.position} must be a whole number from 1 to ${PRIZE_POINTS_MAX.toLocaleString('en-IN')}.`
    }
    if (p.prize != null && p.prize.length > PRIZE_TEXT_MAX) {
      return `The prize for position ${p.position} is too long. Keep it to ${PRIZE_TEXT_MAX} characters.`
    }
  }
  return undefined
}

// A question can only be saved once it has text and at least MIN_OPTIONS options with real
// values (user-requested, 2026-08-16 — "to save a new question, there should be atleast value in
// question field and min 4 options"). Matches openapi.yaml's QuizQuestionInput.options
// minItems: 4/maxItems: 6, which was already the documented contract — this just enforces it in
// the editor instead of letting an incomplete question reach the PATCH call.
export function isQuestionValid(q: QuizQuestionInput): boolean {
  const filled = (q.options ?? []).filter((o) => o.trim() !== '').length
  return q.text.trim() !== '' && filled >= MIN_OPTIONS
}

// The two branding shapes, enforced on upload (2026-09-13, user decision — "image SIZES are fixed
// on immiNow"), at exactly the sizes QuizBrandingModal has documented since the 2026-09-04
// re-dimensioning: Pre-load and Results SHARE one 8:5 card so a single creative works on both
// screens, and the In-quiz banner is 8:3 so one upload fits both the strip above the question
// counter and the quiz's Happening Now card on Home. That second use is why a quiz takes no
// separate cover image the way a webinar or in-person meeting does — this banner IS its cover.
// Exported from here rather than from the modal so the rule is one constant, shared by the two
// pre-load/results fields and checkable in a test without importing a component.
export const QUIZ_BANNER_ASPECT: AspectRequirement = {
  width: 8,
  height: 3,
  tolerance: 0.05,
  idealLabel: '640×240',
  minWidth: 480,
  subject: 'In-quiz banners',
}

export const QUIZ_CARD_ASPECT: AspectRequirement = {
  width: 8,
  height: 5,
  tolerance: 0.05,
  idealLabel: '640×400',
  minWidth: 480,
  subject: 'Pre-load and Results images',
}
