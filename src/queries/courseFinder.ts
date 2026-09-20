import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { track } from '@/lib/analytics'
import { INTAKE_GROUPS, intakeMonthName } from '@/lib/intake'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// Consultant Course Finder (COURSES_MODULE_PLAN.md §4.1, workstream D). Distinct from
// courseSuggestions' useCourses because every search here rides eligibility_for=<id> — the
// server decorates each row's `fit` against THAT person's profile. `personId` is a client
// (journey) OR (2026-08-23) a lead id — the server tries a journey first, then a lead, and
// simply omits `fit` for an imported lead with no linked student account.
export interface CourseFinderFilters {
  personId: string
  search?: string
  // Multi-country (2026-09-18, parity with the Sentpo app's own filter — widened so a search
  // shared from the app survives the trip instead of arriving with everything past the first
  // country named as "Not carried over"). Comma-joined onto the wire, the same idiom
  // filter[field_of_study] already uses.
  countries?: string[]
  level?: string
  // Multi-field (user decision, 2026-08-30) — empty/omitted = any field; comma-joined onto the
  // wire as one filter[field_of_study] value, the same idiom filter[country] already uses.
  fieldOfStudy?: string[]
  // The remaining facets Sentpo Mobile's course filter sheet offers (2026-09-18) — see
  // courseFilterableFields in the mock server for each one's exact matching rule.
  provinceState?: string
  city?: string
  /** A month name, or an `INTAKE_GROUPS` code for every month in one group (M9, 2026-09-19). */
  intake?: string
  /** 'full_time' | 'part_time'. */
  studyMode?: string
  /** 'on_campus' | 'hybrid' | 'online'. */
  delivery?: string
  language?: string
  // "true only when set" perk flags — never sent as `false`, matching GET /courses' own flag
  // semantics (a present-but-false filter would still be a filter; omitting it means "any").
  scholarship?: boolean
  coop?: boolean
  psw?: boolean
  appFeeWaived?: boolean
  openNow?: boolean
  // In `feeCurrency` — the consultancy's own currency (2026-09-10). The server converts each
  // course's fee into it, with a small margin for courses priced in another currency.
  feeMax?: number
  feeCurrency?: string
  // Duration-range bucket bounds, in months (2026-08-31, UAT item 3 — parity with Sentpo
  // Mobile's course search). Either or both may be set; either may be omitted for an open-ended
  // bucket ("Up to 1 year" has no min, "3+ years" has no max).
  durationMinMonths?: number
  durationMaxMonths?: number
  sort?: string
}

// Field of Study chooser (user decision, 2026-08-30) — every field actually present in the
// catalog (18 today), replacing what had been a free-text box that offered no guidance on what
// the catalog actually holds. Rarely changes day to day, so a long staleTime is fine, same as
// useCountries.
export function useCourseFields() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['course-fields'],
    queryFn: async () => {
      const { data, error } = await api.GET('/courses/fields')
      if (error) throw new ApiError('Could not load the fields of study list.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

// Level chooser (console review M14, 2026-09-13) — every level actually present in the catalogue
// this caller can see, replacing a hardcoded four in Course Finder's own filter that offered
// school grades (10th/11th/12th) beside Masters and could not name a rung the catalogue had
// gained. Same shape, scoping and staleness as useCourseFields above; the Sentpo app already
// derives its own level chips this way.
export function useCourseLevels() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['course-levels'],
    queryFn: async () => {
      const { data, error } = await api.GET('/courses/levels')
      if (error) throw new ApiError('Could not load the course levels list.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

// Language chooser (product owner, 2026-09-15) — every language of teaching actually present in
// the catalogue this caller can see, backing the super-admin course form's dropdown. Same shape,
// scoping and staleness as useCourseLevels above; unlike Level this list is not a closed enum —
// the form still lets an admin type a value that is not here yet.
export function useCourseLanguages() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['course-languages'],
    queryFn: async () => {
      const { data, error } = await api.GET('/courses/languages')
      if (error) throw new ApiError('Could not load the course languages list.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

// `hasFilters` (H12 fix, frontend review 1 Sep 2026) — CourseFinderPage builds this from whether
// the consultant has picked an applicant or set any filter/search; without it, mounting the page
// fired `GET /courses` immediately with an empty filter set, before the consultant did anything.
export function useCourseFinder(filters: CourseFinderFilters, hasFilters: boolean) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['course-finder', filters],
    queryFn: async () => {
      const filter: Record<string, string> = { visible: 'true' }
      if (filters.countries?.length) filter.country = filters.countries.join(',')
      if (filters.level) filter.level = filters.level
      if (filters.fieldOfStudy?.length) filter.field_of_study = filters.fieldOfStudy.join(',')
      if (filters.provinceState) filter.province_state = filters.provinceState
      if (filters.city) filter.city = filters.city
      // A MONTH, or every month in its group (assumptions audit M9, product owner 2026-09-19).
      // `filter[intake]` names a month and is matched against the course's own intake months;
      // a whole-group pick sends the group's anchor month plus `intake_any_in_group`, which is
      // how "any month August–December" is expressed without inventing a second vocabulary.
      if (filters.intake) {
        const group = INTAKE_GROUPS.find((g) => g.code === filters.intake)
        if (group) {
          filter.intake = intakeMonthName(group.anchor)
          filter.intake_any_in_group = 'true'
        } else {
          filter.intake = filters.intake
        }
      }
      if (filters.studyMode) filter.study_mode = filters.studyMode
      if (filters.delivery) filter.delivery = filters.delivery
      if (filters.language) filter.language = filters.language
      if (filters.scholarship) filter.scholarship = 'true'
      if (filters.coop) filter.coop = 'true'
      if (filters.psw) filter.psw = 'true'
      if (filters.appFeeWaived) filter.app_fee_waived = 'true'
      if (filters.openNow) filter.open_now = 'true'
      // Never `?? 'INR'` (assumptions audit C5, approved 2026-09-19): a student's ₹20,00,000 cap
      // re-run before the consultancy's display currency had loaded became a CAD 2,000,000 cap,
      // and the server now refuses a fee bound with no currency (400). The query below does not
      // run at all while a cap is set and the currency is still unresolved, so this pair either
      // travels complete or does not travel.
      if (filters.feeMax && filters.feeCurrency) {
        filter.fee_max = String(filters.feeMax)
        filter.fee_currency = filters.feeCurrency
      }
      if (filters.durationMinMonths != null) filter.duration_min_months = String(filters.durationMinMonths)
      if (filters.durationMaxMonths != null) filter.duration_max_months = String(filters.durationMaxMonths)

      // Fires once per DISTINCT search — this queryFn only re-runs when `filters` (the query key)
      // actually changes, never on a plain re-render, so this is the "the query/filters actually
      // fired a search" point rather than every keystroke. No raw query text — has_query/filter
      // count only.
      //
      // Platform Pulse enrichment (2026-08-31, same session) — add the chosen FILTER VALUES, but
      // ENUM-SAFE ONLY (recorded PII rule): never `filters.search`, `filters.provinceState` or
      // `filters.city` (free text). `country` comes from MultiSelect over the countries list,
      // `level` from a fixed SelectField, `fieldOfStudy` from a MultiSelect over the real catalog
      // fields list — all three are closed vocabularies here, unlike mobile's field-of-study
      // filter (which mixes chips with free text and is excluded there). Widened 2026-09-18 with
      // the rest of the facets in the filter_count tally (still no new enum properties beyond
      // country/level/field — those three are what Platform Pulse's dashboards already key on).
      track('search_performed', {
        properties: {
          has_query: Boolean(filters.search),
          filter_count: [
            filters.countries?.length ? filters.countries : undefined,
            filters.level,
            filters.fieldOfStudy?.length ? filters.fieldOfStudy : undefined,
            filters.provinceState,
            filters.city,
            filters.intake,
            filters.studyMode,
            filters.delivery,
            filters.language,
            filters.scholarship,
            filters.coop,
            filters.psw,
            filters.appFeeWaived,
            filters.openNow,
            filters.feeMax,
            // One facet even though a bucket can carry both bounds — same convention mobile's
            // own `_activeFacetCount` uses for the identical filter.
            filters.durationMinMonths ?? filters.durationMaxMonths,
            filters.sort,
          ].filter((v) => v !== undefined && v !== '').length,
          ...(filters.countries?.length ? { country: filters.countries } : {}),
          ...(filters.level ? { study_level: filters.level } : {}),
          ...(filters.fieldOfStudy?.length ? { field_of_study: filters.fieldOfStudy } : {}),
        },
      })

      const { data, error } = await api.GET('/courses', {
        params: {
          query: {
            filter,
            search: filters.search || undefined,
            sort: filters.sort || undefined,
            limit: 50,
            eligibility_for: filters.personId || undefined,
          },
        },
      })
      if (error) throw new ApiError('Could not load courses.', error)
      return data
    },
    // No applicant required (user, 2026-08-23). A consultant researching for a LEAD must be able
    // to search the catalog without attaching a client record — a lead has not shared a profile,
    // and demanding one to browse courses would mean either inventing a record or not searching.
    // `eligibility_for` is already optional; without it the server simply returns no fit data.
    // `hasFilters` on top of that (H12) is the "don't fetch on bare page load" gate.
    //
    // The third clause is C5: with a fee cap set but the display currency not yet resolved,
    // searching anyway would silently return the catalogue WITHOUT the cap — more courses than
    // the consultant asked for, with the chip still on screen saying they were filtered. Waiting
    // one tick for the currency is the honest answer.
    enabled: isAuthed && hasFilters && !(Boolean(filters.feeMax) && !filters.feeCurrency),
  })
}
