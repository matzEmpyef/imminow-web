import { useEffect, useState } from 'react'
import type { usePersonPicker } from '@/lib/usePersonPicker'
import type { components } from '@/api/schema'

type Course = components['schemas']['Course']

// Course Finder's "applicant" is now either a Client (journey) or a Lead (user, 2026-08-23: "we
// need the ability to select leads also"). One id alone is ambiguous — a client and a lead never
// share an id space in practice, but which endpoint to call for "Suggest" depends on knowing
// which kind was picked, not on guessing from where the id happened to resolve.
export type SelectedPerson = { id: string; kind: 'client' | 'lead' } | null

// "Filter set cached per (consultant, applicant)" (COURSES_MODULE_PLAN.md §4.1, Tier 4) — one
// blob per applicant plus a pointer to the last-open one, so switching between two applicants
// mid-call resumes each one's own search instead of bleeding filters across cases. Per-device via
// localStorage (the browser session IS the consultant); corrupt blob → fresh defaults. Cached by
// id alone (not id+kind) — a client and a lead never share an id, so this is safe, and it means a
// lead who later converts to a client keeps their cached filters under the conversion.
const LAST_PERSON_KEY = 'course_finder_last_client'
const stateKey = (personId: string) => `course_finder_state:${personId}`
const shortlistKey = (personId: string) => `course_finder_shortlist:${personId}`

export interface FinderState {
  personId: string
  personKind: 'client' | 'lead'
  search: string
  country: string
  level: string
  // Multi-field (user decision, 2026-08-30) — empty = any field, same convention '' carried as a
  // string before this.
  fieldOfStudy: string[]
  feeMaxLakh: string
  // Duration-range bucket key (2026-08-31, UAT item 3), same buckets Sentpo Mobile's filter
  // sheet offers — '' = any. Kept as a bucket KEY rather than raw min/max here so the SelectField
  // has a single value to bind to; DURATION_BUCKETS below is the one place that maps a key to
  // its (min, max) month bounds, shared with the query builder in CourseFinderPage.
  durationBucket: string
  sort: string
  eligibleOnly: boolean
}

export const DEFAULT_STATE: FinderState = {
  personId: '',
  personKind: 'client',
  search: '',
  country: '',
  level: '',
  fieldOfStudy: [],
  feeMaxLakh: '',
  durationBucket: '',
  sort: '',
  eligibleOnly: true,
}

// Non-overlapping (min, max) month pairs — a null bound is open-ended. Mirrors mobile's
// `_durationBuckets` in search_results_screen.dart exactly, so a consultant and a student narrow
// the same catalog the same way. Consultants search the same catalog students do (COURSES_MODULE_
// PLAN.md §4.1), so this filter's parity with mobile is deliberate, not incidental.
export const DURATION_BUCKETS: Record<string, { label: string; min?: number; max?: number }> = {
  le_12: { label: 'Up to 1 year', max: 12 },
  '13_24': { label: '1 – 2 years', min: 13, max: 24 },
  '25_36': { label: '2 – 3 years', min: 25, max: 36 },
  gt_36: { label: '3+ years', min: 37 },
}

function loadPersonState(personId: string, personKind: 'client' | 'lead'): FinderState | null {
  try {
    const raw = localStorage.getItem(stateKey(personId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FinderState> & { fieldOfStudy?: string | string[] }
    // Pre-2026-08-30 caches stored fieldOfStudy as a single string ('' = any); migrate in place
    // so an existing consultant's cache doesn't crash the multi-select on the next load.
    const fieldOfStudy =
      typeof parsed.fieldOfStudy === 'string'
        ? parsed.fieldOfStudy
          ? [parsed.fieldOfStudy]
          : []
        : (parsed.fieldOfStudy ?? DEFAULT_STATE.fieldOfStudy)
    return { ...DEFAULT_STATE, ...parsed, fieldOfStudy, personId, personKind }
  } catch {
    return null
  }
}

function loadInitialState(): FinderState {
  try {
    const raw = localStorage.getItem(LAST_PERSON_KEY)
    if (!raw) return DEFAULT_STATE
    // Pre-2026-08-23 caches stored a bare id string; new ones store `id:kind`. Both are handled
    // so an existing consultant's cache is not silently discarded by this change.
    const [id, kind] = raw.includes(':') ? raw.split(':') : [raw, 'client']
    return loadPersonState(id, kind === 'lead' ? 'lead' : 'client') ?? DEFAULT_STATE
  } catch {
    return DEFAULT_STATE
  }
}

// The walk-through-on-a-call working list (plan §4.1's "Add to shortlist (drawer)"), UI-labelled
// "Note down" rather than "Shortlist" (user, 2026-08-24) — the word "shortlist" already means a
// specific other thing in this app (the student's own private saved-courses board, plan §3.4,
// invisible to consultancies until shared), and reusing it here read as though the consultant
// could reach into that private list directly. This is unrelated: a purely local, per-consultant
// scratchpad for one call, with no server record at all. Type/variable names keep the old word —
// only the words a user actually sees changed. Snapshots the display fields so the drawer renders
// without refetching rows that may have scrolled away.
export interface ShortlistEntry {
  course_id: string
  name: string
  college_name: string | null
  country: string | null
}

function loadShortlist(personId: string): ShortlistEntry[] {
  try {
    const raw = localStorage.getItem(shortlistKey(personId))
    return raw ? (JSON.parse(raw) as ShortlistEntry[]) : []
  } catch {
    return []
  }
}

// The finder's whole client-side state machine — filter state, the notes scratchpad, both
// localStorage persistence effects, and the applicant-switch seeding rules — extracted out of
// CourseFinderPage's body so the page reads as composition (frontend re-audit, 2026-08-25:
// the exported component spanned ~600 lines as a single function).
export function useCourseFinderState(
  clientRows: ReturnType<typeof usePersonPicker>['clientRows'],
  leadRows: ReturnType<typeof usePersonPicker>['leadRows'],
) {
  const [state, setState] = useState<FinderState>(loadInitialState)
  const [shortlist, setShortlist] = useState<ShortlistEntry[]>(() =>
    state.personId ? loadShortlist(state.personId) : [],
  )
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    try {
      if (!state.personId) {
        // A cleared selection has to erase the pointer too, or reloading the page silently
        // brings the old applicant right back — clearing would otherwise only ever work until
        // the next refresh (found alongside the missing clear button itself, 2026-08-24).
        localStorage.removeItem(LAST_PERSON_KEY)
        return
      }
      localStorage.setItem(stateKey(state.personId), JSON.stringify(state))
      localStorage.setItem(LAST_PERSON_KEY, `${state.personId}:${state.personKind}`)
    } catch {
      // Best-effort cache — a full/blocked localStorage never breaks the search itself.
    }
  }, [state])

  useEffect(() => {
    if (!state.personId) return
    try {
      localStorage.setItem(shortlistKey(state.personId), JSON.stringify(shortlist))
    } catch {
      // Same best-effort rule as the filter cache.
    }
  }, [shortlist, state.personId])

  // Applicant switch: their own cached filter set wins when one exists (plan §4.1's
  // per-applicant cache); a first-time pick seeds from their case preferences (finalized
  // country first, else the journey's target country + study level) — the consultant then
  // adjusts from there rather than starting blank. A lead's own `preferences` (only ever set
  // for `origin: sentpo`) seeds the same two fields the same way.
  function handlePersonChange(personId: string, kind: 'client' | 'lead') {
    // The clear ("x") button on SearchSelect fires this with an empty id — genuinely back to no
    // one selected, not "a lead with an empty id". Handled explicitly rather than falling through
    // to the fresh-pick branch below, which would work by coincidence (both lookups miss) but
    // leave `personKind` on whatever the clear button's caller guessed, for no reason.
    if (!personId) {
      setState(DEFAULT_STATE)
      setShortlist([])
      setDrawerOpen(false)
      return
    }
    const cached = loadPersonState(personId, kind)
    if (cached) {
      setState(cached)
    } else {
      // Fresh pick seeds from DEFAULTS + their preferences — never from the previous
      // applicant's state (caught live 2026-08-22: spreading `...s` here leaked the prior
      // applicant's free-text filters into the new applicant's cache).
      if (kind === 'client') {
        const client = clientRows.find((c) => c.id === personId)
        setState({
          ...DEFAULT_STATE,
          personId,
          personKind: 'client',
          country: client?.finalized_country ?? client?.study_preferences?.target_countries?.[0] ?? '',
          level: client?.study_preferences?.study_level ?? '',
        })
      } else {
        const lead = leadRows.find((l) => l.id === personId)
        setState({
          ...DEFAULT_STATE,
          personId,
          personKind: 'lead',
          country: lead?.preferences?.target_countries?.[0] ?? '',
          level: lead?.preferences?.study_level ?? '',
        })
      }
    }
    setShortlist(loadShortlist(personId))
    setDrawerOpen(false)
  }

  function toggleShortlist(course: Course) {
    setShortlist((list) =>
      list.some((e) => e.course_id === course.id)
        ? list.filter((e) => e.course_id !== course.id)
        : [
            ...list,
            {
              course_id: course.id,
              name: course.name,
              college_name: course.college_name ?? null,
              country: course.country ?? null,
            },
          ],
    )
  }

  return { state, setState, shortlist, setShortlist, drawerOpen, setDrawerOpen, handlePersonChange, toggleShortlist }
}
