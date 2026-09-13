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
