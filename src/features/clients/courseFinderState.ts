import { useEffect, useState } from 'react'
import type { usePersonPicker } from '@/lib/usePersonPicker'
import type { components } from '@/api/schema'
import { humaniseCode } from '@/lib/humanise'
import { INTAKE_GROUPS, INTAKE_MONTHS } from '@/lib/intake'
import { useCourseLevels } from '@/queries/courseFinder'

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
  // Multi-country (2026-09-18) — widened to parity with the Sentpo app's own Study Abroad filter
  // (COURSES_MODULE_PLAN.md's shared-search work: a search sent from the app used to arrive
  // gutted, "Not carried over: Other countries (...)", because Course Finder could only ever hold
  // one). Empty = any country. '' as a single value used to mean the same thing before this.
  countries: string[]
  level: string
  // Multi-field (user decision, 2026-08-30) — empty = any field, same convention '' carried as a
  // string before this.
  fieldOfStudy: string[]
  // Text, not a picker (2026-09-18) — `GET /courses/provinces` only ever answers for ONE country,
  // and Country here can now hold several at once, so there is no single list to source a select
  // from without guessing which country's provinces to show. Same free-text shape as `city` below.
  provinceState: string
  city: string
  // A MONTH NAME, or a group code (`aug_dec` / `jan_jul`), or '' for any (assumptions audit M9,
  // product owner 2026-09-19). `filter[intake]` names a month now and is matched against the
  // course's own `intakes`; the half-year buckets this used to hold — `first_half` /
  // `second_half` — match nothing at all on the current contract.
  intake: string
  // 'full_time' | 'part_time' | '' (any).
  studyMode: string
  // 'on_campus' | 'hybrid' | 'online' | '' (any).
  delivery: string
  // A language of teaching from GET /courses/languages, or '' for any.
  language: string
  // A plain amount in the consultancy's own currency (2026-09-10) — was ₹ lakh for everyone.
  feeMax: string
  // Which currency `feeMax` is in, when the state came from a SHARED SEARCH link — '' means "the
  // viewer's own display currency", the normal case. Round-tripped through the URL since the
  // assumptions audit (C5, approved 2026-09-19): the cap used to travel without its currency, so
  // a student's ₹20,00,000 budget re-opened by a Canadian consultant became a CAD 2,000,000 cap
  // and every course passed it.
  feeCurrency: string
  // Duration-range bucket key (2026-08-31, UAT item 3), same buckets Sentpo Mobile's filter
  // sheet offers — '' = any. Kept as a bucket KEY rather than raw min/max here so the SelectField
  // has a single value to bind to; DURATION_BUCKETS below is the one place that maps a key to
  // its (min, max) month bounds, shared with the query builder in CourseFinderPage.
  durationBucket: string
  // The five "true only when set" perk flags mobile's filter sheet offers under Highlights /
  // Applications open (2026-09-18) — each sent as filter[...]=true only when checked, never
  // filter[...]=false, matching GET /courses' own "true flag" semantics.
  scholarship: boolean
  coop: boolean
  psw: boolean
  appFeeWaived: boolean
  openNow: boolean
  sort: string
  eligibleOnly: boolean
}

export const DEFAULT_STATE: FinderState = {
  personId: '',
  personKind: 'client',
  search: '',
  countries: [],
  level: '',
  fieldOfStudy: [],
  provinceState: '',
  city: '',
  intake: '',
  studyMode: '',
  delivery: '',
  language: '',
  feeMax: '',
  feeCurrency: '',
  durationBucket: '',
  scholarship: false,
  coop: false,
  psw: false,
  appFeeWaived: false,
  openNow: false,
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

// Intake options — A MONTH, or every month in one group (assumptions audit M9, product owner
// 2026-09-19). The two half-year buckets that used to live here (`first_half` / `second_half`)
// are not values the catalogue can match any more: `filter[intake]` compares against a course's
// own intake MONTHS, and `filter[intake_any_in_group]` is what widens one month to its group.
// Never "Fall"/"Spring" — an Australian February intake is not a "Spring" one.
export const INTAKE_OPTIONS: Record<string, string> = {
  ...Object.fromEntries(INTAKE_GROUPS.map((g) => [g.code, `Any month ${g.label}`])),
  ...Object.fromEntries(INTAKE_MONTHS.map((m) => [m.name, m.name])),
}

// Links minted before 2026-09-19 carry the old halves. The server folds them the same way for a
// student's own intake — `first_half` is the Jan–Jul group, `second_half` the Aug–Dec one — so
// an old shared search opens on the group the sender meant rather than being dropped.
const LEGACY_INTAKE_HALVES: Record<string, string> = {
  first_half: 'jan_jul',
  second_half: 'aug_dec',
}

/** A shared link's `intake` value as this console will use it, or '' when it names nothing. */
export function resolveSharedIntake(raw: string): string {
  const value = LEGACY_INTAKE_HALVES[raw] ?? raw
  if (INTAKE_OPTIONS[value]) return value
  // A month name in any casing, or a bare 1–12, both of which the contract accepts.
  const byName = INTAKE_MONTHS.find((m) => m.name.toLowerCase() === value.trim().toLowerCase())
  if (byName) return byName.name
  const byNumber = INTAKE_MONTHS.find((m) => String(m.value) === value.trim())
  return byNumber ? byNumber.name : ''
}

// Study mode / Delivery wire values → labels, matching mobile's `studyModeLabels` /
// `deliveryLabels` (course_filter_sheet.dart) exactly.
export const STUDY_MODE_OPTIONS: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
}
export const DELIVERY_OPTIONS: Record<string, string> = {
  on_campus: 'On campus',
  hybrid: 'Hybrid',
  online: 'Online',
}

function loadPersonState(personId: string, personKind: 'client' | 'lead'): FinderState | null {
  try {
    const raw = localStorage.getItem(stateKey(personId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Pre-2026-08-30 caches stored fieldOfStudy as a single string ('' = any); migrate in place
    // so an existing consultant's cache doesn't crash the multi-select on the next load.
    const fieldOfStudy = Array.isArray(parsed.fieldOfStudy)
      ? (parsed.fieldOfStudy as string[])
      : typeof parsed.fieldOfStudy === 'string' && parsed.fieldOfStudy
        ? [parsed.fieldOfStudy]
        : DEFAULT_STATE.fieldOfStudy
    // Pre-2026-09-18 caches stored `country` as a single string (Course Finder's old single-select).
    // Migrated to `countries: string[]` here rather than crashing the new multi-select or silently
    // dropping the consultant's cached filter — a cache written by THIS build already has
    // `countries` as an array, so that shape wins when present.
    const countries = Array.isArray(parsed.countries)
      ? (parsed.countries as string[])
      : typeof parsed.country === 'string' && parsed.country
        ? [parsed.country]
        : DEFAULT_STATE.countries
    // Drop the legacy `country` key explicitly rather than let it ride through the spread below —
    // otherwise it survives as a stray property on every subsequent save (it is not part of
    // FinderState, so nothing ever overwrites or clears it again).
    const { country: _legacyCountry, ...parsedRest } = parsed
    return {
      ...DEFAULT_STATE,
      ...(parsedRest as Partial<FinderState>),
      fieldOfStudy,
      countries,
      personId,
      personKind,
    }
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
  // A shared search card links here with its filters in the URL; that wins over the cache.
  const [state, setState] = useState<FinderState>(() => finderStateFromUrl() ?? loadInitialState())
  const [shortlist, setShortlist] = useState<ShortlistEntry[]>(() =>
    state.personId ? loadShortlist(state.personId) : [],
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
  // A shared link's `level` is only APPLIED once it has been matched against the levels the
  // catalogue actually serves (assumptions audit M39, product owner 2026-09-19). An unmatched
  // one becomes "Any level" here rather than sitting on the search as a code no course carries
  // and returning nothing; the chat card the consultant came from names it as dropped (M30).
  const courseLevels = useCourseLevels()
  useEffect(() => {
    const resolved = resolveSharedLevel(state.level, courseLevels.data)
    if (resolved === undefined || resolved === state.level) return
    setState((s) => ({ ...s, level: resolved ?? '' }))
  }, [courseLevels.data, state.level])

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
        // `study_preferences` is the JOURNEY's own case data the consultancy captured, not the
        // student's preference store, and it still carries an array (assumptions audit M8 changed
        // the student's own field, not this one). The finalized country wins where there is one.
        const country = client?.finalized_country ?? client?.study_preferences?.target_countries?.[0] ?? ''
        setState({
          ...DEFAULT_STATE,
          personId,
          personKind: 'client',
          countries: country ? [country] : [],
          level: client?.study_preferences?.study_level ?? '',
        })
      } else {
        const lead = leadRows.find((l) => l.id === personId)
        // ONE destination (assumptions audit M8, product owner 2026-09-19) — `[0]` of the derived
        // array was array position standing in for a decision nobody made.
        const country = lead?.preferences?.target_country ?? ''
        setState({
          ...DEFAULT_STATE,
          personId,
          personKind: 'lead',
          countries: country ? [country] : [],
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

// ---- Shared searches (2026-09-14) -------------------------------------------------------------
// A search card in chat carries GET /courses filter keys. These three helpers turn that into a
// Course Finder link, read the link back into state, and turn state into what "Send this search"
// posts — so the round trip uses one vocabulary end to end.
//
// Widened 2026-09-18 (COURSES_MODULE_PLAN.md's shared-search follow-up) alongside Course Finder's
// own filters: every URL/outgoing key below is the literal `filter[...]` wire name, so this stays
// a pure pass-through as the server's own carried-over set grows — no key here needs to change
// again just because the server starts copying one more facet into `SharedSearch.filters`.

export function durationBucketKeyFor(min: number | null, max: number | null): string {
  const hit = Object.entries(DURATION_BUCKETS).find(([, b]) => (b.min ?? null) === min && (b.max ?? null) === max)
  return hit ? hit[0] : ''
}

// The full set of plain string/enum filter keys a shared search can carry in EITHER direction —
// same literal spelling as the `filter[...]` key, so URLSearchParams round-trips them with no
// per-key translation. `country`, `fee_max` and `duration_*` are handled separately below (country
// because it is a list; fee and duration because they need currency/bucket-key handling).
const SHARED_SEARCH_PLAIN_KEYS = [
  'level',
  'field_of_study',
  'search',
  'province_state',
  'city',
  'intake',
  'study_mode',
  'delivery',
  'language',
] as const
const SHARED_SEARCH_FLAG_KEYS = ['scholarship', 'coop', 'psw', 'app_fee_waived', 'open_now'] as const

export function courseFinderUrlForSharedSearch(
  person: { id: string; kind: 'client' | 'lead' },
  filters: Record<string, string>,
): string {
  const params = new URLSearchParams({ person: person.id, kind: person.kind })
  // Comma-joined either way — a legacy single-country link (`country=USA`) and a wide one
  // (`country=USA,Canada`) both come back out the same way in finderStateFromUrl's split.
  if (filters.country) params.set('country', filters.country)
  for (const key of SHARED_SEARCH_PLAIN_KEYS) {
    if (filters[key]) params.set(key, filters[key])
  }
  for (const key of SHARED_SEARCH_FLAG_KEYS) {
    if (filters[key] === 'true') params.set(key, 'true')
  }
  // The cap and the currency it is in travel together or not at all (assumptions audit C5,
  // approved 2026-09-19) — a bare `fee_max` was re-read in whatever currency the receiving
  // consultant happened to display in, turning ₹20,00,000 into CAD 2,000,000.
  if (filters.fee_max && filters.fee_currency) {
    params.set('fee_max', filters.fee_max)
    params.set('fee_currency', filters.fee_currency)
  }
  const bucket = durationBucketKeyFor(
    filters.duration_min_months ? Number(filters.duration_min_months) : null,
    filters.duration_max_months ? Number(filters.duration_max_months) : null,
  )
  if (bucket) params.set('duration', bucket)
  return `/clients/course-finder?${params.toString()}`
}

export function finderStateFromUrl(): FinderState | null {
  try {
    const params = new URLSearchParams(window.location.search)
    const personId = params.get('person')
    if (!personId) return null
    const duration = params.get('duration') ?? ''
    const intake = params.get('intake') ?? ''
    const studyMode = params.get('study_mode') ?? ''
    const delivery = params.get('delivery') ?? ''
    return {
      ...DEFAULT_STATE,
      personId,
      personKind: params.get('kind') === 'lead' ? 'lead' : 'client',
      search: params.get('search') ?? '',
      // Handles both a legacy single-value link (`country=USA`, no comma) and a new multi-value
      // one (`country=USA,Canada`) with the same split — old shared-search links keep working.
      countries: (params.get('country') ?? '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      // Kept VERBATIM here (assumptions audit M39, product owner 2026-09-19). It used to be
      // lower-cased, which is not validation: `PG_Diploma` became `pg_diploma`, a code the
      // catalogue does not hold, and the finder returned nothing with the chip still showing.
      // `resolveSharedLevel` below matches it against the levels the server actually serves
      // once they have loaded, and `useCourseFinderState` clears it to "Any level" when it
      // matches none — the chat card says so under the search (M30).
      level: params.get('level') ?? '',
      fieldOfStudy: (params.get('field_of_study') ?? '')
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
      provinceState: params.get('province_state') ?? '',
      city: params.get('city') ?? '',
      intake: resolveSharedIntake(intake),
      studyMode: STUDY_MODE_OPTIONS[studyMode] ? studyMode : '',
      delivery: DELIVERY_OPTIONS[delivery] ? delivery : '',
      language: params.get('language') ?? '',
      feeMax: params.get('fee_max') ?? '',
      // The sender's currency travels with the cap (C5) — without it the receiving consultant
      // re-ran the same number in their own money.
      feeCurrency: params.get('fee_currency') ?? '',
      durationBucket: DURATION_BUCKETS[duration] ? duration : '',
      scholarship: params.get('scholarship') === 'true',
      coop: params.get('coop') === 'true',
      psw: params.get('psw') === 'true',
      appFeeWaived: params.get('app_fee_waived') === 'true',
      openNow: params.get('open_now') === 'true',
    }
  } catch {
    return null
  }
}

/**
 * A shared `level` matched against the levels the catalogue actually serves.
 *
 * Case-insensitive, so a link written `Masters` still opens as `masters` — that much of the old
 * lower-casing was worth keeping. Anything with no match returns `null`: the filter is dropped
 * and NAMED rather than applied as a code no course carries (assumptions audit M39, product
 * owner 2026-09-19). `undefined` levels means "not loaded yet" — nothing is judged until the
 * list is in.
 */
export function resolveSharedLevel(level: string, levels: string[] | undefined): string | null | undefined {
  if (!level) return ''
  if (!levels) return undefined
  return levels.find((l) => l.toLowerCase() === level.toLowerCase()) ?? null
}

/**
 * Every filter key on a shared search that THIS console will not carry into Course Finder,
 * worded for a person (assumptions audit M30 + M39, product owner 2026-09-19).
 *
 * The chat card already lists what the SERVER dropped (`SharedSearch.left_out`); this is the
 * other half of the same honesty — a filter the sender set, that the server kept, and that the
 * console then quietly discarded on the way to the results. A search opened from chat must not
 * silently widen: "Masters, Canada, scholarships, Jan intake, Toronto" opening as every Masters
 * in Canada is the defect, and an unlisted drop is what made it invisible.
 *
 * `levels` is the fetched catalogue list; pass `undefined` while it is still loading and the
 * level is simply not judged yet.
 */
export function consoleDroppedFilters(filters: Record<string, string>, levels: string[] | undefined): string[] {
  const carried = new Set<string>([
    'country',
    ...SHARED_SEARCH_PLAIN_KEYS,
    ...SHARED_SEARCH_FLAG_KEYS,
    'fee_max',
    'fee_currency',
    'duration_min_months',
    'duration_max_months',
  ])
  const dropped: string[] = []
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue
    if (!carried.has(key)) dropped.push(humaniseCode(key))
  }
  if (filters.level && resolveSharedLevel(filters.level, levels) === null) {
    dropped.push(`Level (${filters.level})`)
  }
  if (filters.intake && !resolveSharedIntake(filters.intake)) dropped.push(`Intake (${filters.intake})`)
  if (filters.study_mode && !STUDY_MODE_OPTIONS[filters.study_mode]) {
    dropped.push(`Study mode (${filters.study_mode})`)
  }
  if (filters.delivery && !DELIVERY_OPTIONS[filters.delivery]) dropped.push(`Delivery (${filters.delivery})`)
  // The cap and its currency travel together or not at all (C5) — a cap with no currency is
  // dropped rather than re-read in the viewer's own money.
  if (filters.fee_max && !filters.fee_currency) dropped.push('Fee cap (no currency was sent with it)')
  if (
    (filters.duration_min_months || filters.duration_max_months) &&
    !durationBucketKeyFor(
      filters.duration_min_months ? Number(filters.duration_min_months) : null,
      filters.duration_max_months ? Number(filters.duration_max_months) : null,
    )
  ) {
    dropped.push('Duration (not one of the ranges this search offers)')
  }
  return dropped
}

export function sharedSearchFiltersFrom(
  state: FinderState,
  feeCurrency: string,
): { filters: Record<string, string>; search?: string } {
  const filters: Record<string, string> = {}
  if (state.countries.length) filters.country = state.countries.join(',')
  if (state.level) filters.level = state.level
  if (state.fieldOfStudy.length) filters.field_of_study = state.fieldOfStudy.join(',')
  if (state.provinceState) filters.province_state = state.provinceState
  if (state.city) filters.city = state.city
  if (state.intake) filters.intake = state.intake
  if (state.studyMode) filters.study_mode = state.studyMode
  if (state.delivery) filters.delivery = state.delivery
  if (state.language) filters.language = state.language
  if (state.scholarship) filters.scholarship = 'true'
  if (state.coop) filters.coop = 'true'
  if (state.psw) filters.psw = 'true'
  if (state.appFeeWaived) filters.app_fee_waived = 'true'
  if (state.openNow) filters.open_now = 'true'
  if (state.feeMax && Number(state.feeMax) > 0) {
    filters.fee_max = state.feeMax
    filters.fee_currency = feeCurrency
  }
  const bucket = state.durationBucket ? DURATION_BUCKETS[state.durationBucket] : undefined
  if (bucket?.min != null) filters.duration_min_months = String(bucket.min)
  if (bucket?.max != null) filters.duration_max_months = String(bucket.max)
  return { filters, search: state.search || undefined }
}
