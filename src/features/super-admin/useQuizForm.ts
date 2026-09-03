import { useState } from 'react'
import { browserTimezone, utcIsoToWallClock, wallClockToUtcIso } from '@/lib/eventTimezones'
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
  questionsPerAttempt: number
  setQuestionsPerAttempt: (v: number) => void
  timeLimitMinutes: number
  setTimeLimitMinutes: (v: number) => void
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
  toPayload: () => QuizPayload
}

export interface QuizPayload {
  title: string
  description: string | null
  starts_at: string
  ends_at: string | undefined
  timezone: string
  questions_per_attempt: number
  time_limit_minutes: number
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
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState(editingEvent?.questions_per_attempt ?? 5)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(editingEvent?.time_limit_minutes ?? 15)
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

  const isValid = Boolean(title) && Boolean(startsAt)

  function toPayload(): QuizPayload {
    return {
      title,
      description: description || null,
      starts_at: wallClockToUtcIso(startsAt, timezone),
      ends_at: endsAt ? wallClockToUtcIso(endsAt, timezone) : undefined,
      timezone,
      questions_per_attempt: questionsPerAttempt,
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
    targeting, setTargeting, isValid, toPayload,
  }
}
