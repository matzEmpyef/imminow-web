// Split out of QuizAdminPage.tsx (Phase 3 plan, Tier B3, 2026-09-03) — pure movement unless noted.
import type { components } from '@/api/schema'

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
