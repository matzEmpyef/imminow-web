import { useState } from 'react'
import { browserTimezone, nowWallClock, utcIsoToWallClock, wallClockToUtcIso } from '@/lib/eventTimezones'
import { hasAnyTargeting, type Targeting } from '@/lib/targeting'
import { emptyPrize, type Event, type PositionPrize } from './quizShared'

// Everything QuizSettingsModal's form needs — state, the handlers that mutate it, validity and
// the request body — as ONE typed object (Phase 3 plan, Tier B3, 2026-09-03). Same treatment
// CourseFormModal got with useCourseForm: the modal keeps the query hooks (useCreateEvent /
// useUpdateEvent) and the mutate() call; this hook owns nothing that talks to the server.
export interface QuizFormValue {
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  timezone: string
  setTimezone: (v: string) => void
  startsAt: string
  setStartsAt: (v: string) => void
  endsAt: string
  setEndsAt: (v: string) => void
  // Both null while their field is empty — never `Number('') = 0` (2026-09-11 fix). Questions per
  // attempt is required (the form blocks Save while it's null); time limit is genuinely optional,
  // and null means "no limit," matching the server's own nullable field — clearing it must stay
  // blank, not silently become a 0-minute quiz that auto-submits instantly.
  questionsPerAttempt: number | null
  setQuestionsPerAttempt: (v: number | null) => void
  timeLimitMinutes: number | null
  setTimeLimitMinutes: (v: number | null) => void
  participationPoints: number
  setParticipationPoints: (v: number) => void
  prizes: PositionPrize[]
  updatePrize: (i: number, p: PositionPrize) => void
  removePrize: (i: number) => void
  addPrize: () => void
  targeting: Targeting
  setTargeting: (v: Targeting) => void
  // Mirrors the submit gate the modal always had: `if (!title || !startsAt) return`.
  isValid: boolean
  /**
   * The three time rules the server enforces (assumptions audit C16, approved 2026-09-19), each
   * as the message its own control shows. `nowInZone` is the `min` the datetime fields need, on
   * the quiz's own clock; `started` disables the start, which is fixed once a quiz is running.
   */
  nowInZone: string
  started: boolean
  startError?: string
  endError?: string
  toPayload: () => QuizPayload
}

export interface QuizPayload {
  title: string
  description: string | null
  starts_at: string
  ends_at: string | undefined
  timezone: string
  questions_per_attempt: number
  time_limit_minutes: number | null
  points_override: number
  position_prizes: PositionPrize[]
  targeting: Targeting | null
}

export function useQuizForm(editingEvent?: Event): QuizFormValue {
  const [title, setTitle] = useState(editingEvent?.title ?? '')
  const [description, setDescription] = useState(editingEvent?.description ?? '')
  // The zone the admin is TYPING IN (2026-08-23). A quiz has no venue, so unlike a physical
  // meeting nothing is local to a place — the window converts to each student's own clock, which
  // is correct. What was missing is the same thing webinars were missing: the admin had no way to
  // see which clock they were entering the window in, so an admin abroad opening an India quiz
  // could not check their own work.
  const [timezone, setTimezone] = useState(editingEvent?.timezone ?? browserTimezone())
  const [startsAt, setStartsAt] = useState(
    editingEvent?.starts_at
      ? utcIsoToWallClock(editingEvent.starts_at, editingEvent.timezone ?? browserTimezone())
      : '',
  )
  const [endsAt, setEndsAt] = useState(
    editingEvent?.ends_at ? utcIsoToWallClock(editingEvent.ends_at, editingEvent.timezone ?? browserTimezone()) : '',
  )
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState<number | null>(
    editingEvent?.questions_per_attempt ?? 5,
  )
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(editingEvent?.time_limit_minutes ?? 15)
  const [participationPoints, setParticipationPoints] = useState(editingEvent?.points_override ?? 10)
  const [prizes, setPrizes] = useState<PositionPrize[]>(editingEvent?.position_prizes ?? [])
  // Quizzes have supported targeting in the data model all along, but the console never exposed
  // it — so every quiz reached every student regardless of what the schema allowed.
  const [targeting, setTargeting] = useState<Targeting>(editingEvent?.targeting ?? {})

  function updatePrize(i: number, p: PositionPrize) {
    setPrizes((prev) => prev.map((existing, idx) => (idx === i ? p : existing)))
  }

  function removePrize(i: number) {
    setPrizes((prev) => prev.filter((_, idx) => idx !== i))
  }

  function addPrize() {
    setPrizes((prev) => [...prev, emptyPrize(prev.length + 1)])
  }

  // TIME RULES (assumptions audit C16, approved 2026-09-19), mirroring the server's own.
  //
  // The end time is REQUIRED once the quiz has ANY position prize — a points prize or a named
  // one like "Bluetooth speaker" (C16 follow-up, 2026-09-19: the server refuses the save on
  // `position_prizes.length > 0 && ends_at == null`, so checking only the points ones let a
  // label-only quiz reach a 400 the form had already said was fine). Settlement waits on
  // `ends_at` while display assumed a one-hour window, so a quiz created without one showed
  // "ended" with a winner after an hour and the advertised prize was never given — silently.
  // A quiz with no prizes still needs no end; its window is genuinely open-ended.
  const nowInZone = nowWallClock(timezone)
  const started = Boolean(editingEvent?.starts_at && Date.parse(editingEvent.starts_at) <= Date.now())
  const isEditing = Boolean(editingEvent?.id)
  const startInPast = !isEditing && Boolean(startsAt) && startsAt < nowInZone
  const endBeforeStart = Boolean(startsAt && endsAt && endsAt <= startsAt)
  const endInPast = Boolean(endsAt) && endsAt < nowInZone
  // Every row counts, empty ones included: `toPayload` sends `position_prizes` as-is, so an
  // untouched row is a prize as far as the server is concerned.
  const endRequired = prizes.length > 0 && endsAt === ''
  const startError = startInPast ? 'The start cannot be in the past.' : undefined
  const endError = endRequired
    ? 'A quiz with position prizes needs an end time — that is when the prizes are paid.'
    : endBeforeStart
      ? 'The end must be after the start.'
      : endInPast
        ? 'The end cannot be in the past — it can be extended, not brought forward.'
        : undefined

  // Questions per attempt is required, min 1 (server: "whole ≥1"); time limit stays optional —
  // null (blank) or a whole number ≥1, never 0.
  const isValid =
    Boolean(title) &&
    Boolean(startsAt) &&
    questionsPerAttempt != null &&
    questionsPerAttempt >= 1 &&
    (timeLimitMinutes == null || timeLimitMinutes >= 1) &&
    !startError &&
    !endError

  function toPayload(): QuizPayload {
    return {
      title,
      description: description || null,
      starts_at: wallClockToUtcIso(startsAt, timezone),
      ends_at: endsAt ? wallClockToUtcIso(endsAt, timezone) : undefined,
      timezone,
      // Non-null asserted: `toPayload` is only ever called once `isValid` has already gated the
      // submit button, which guarantees this.
      questions_per_attempt: questionsPerAttempt as number,
      time_limit_minutes: timeLimitMinutes,
      points_override: participationPoints,
      position_prizes: prizes,
      targeting: hasAnyTargeting(targeting) ? targeting : null,
    }
  }

  return {
    title, setTitle, description, setDescription, timezone, setTimezone, startsAt, setStartsAt,
    endsAt, setEndsAt, questionsPerAttempt, setQuestionsPerAttempt, timeLimitMinutes, setTimeLimitMinutes,
    participationPoints, setParticipationPoints, prizes, updatePrize, removePrize, addPrize,
    targeting, setTargeting, isValid, nowInZone, started, startError, endError, toPayload,
  }
}
