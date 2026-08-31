import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { track } from '@/lib/analytics'
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
  country?: string
  level?: string
  // Multi-field (user decision, 2026-08-30) — empty/omitted = any field; comma-joined onto the
  // wire as one filter[field_of_study] value, the same idiom filter[country] already uses.
  fieldOfStudy?: string[]
  feeMaxInr?: number
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

export function useCourseFinder(filters: CourseFinderFilters) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['course-finder', filters],
    queryFn: async () => {
      const filter: Record<string, string> = { visible: 'true' }
      if (filters.country) filter.country = filters.country
      if (filters.level) filter.level = filters.level
      if (filters.fieldOfStudy?.length) filter.field_of_study = filters.fieldOfStudy.join(',')
      if (filters.feeMaxInr) filter.fee_max = String(filters.feeMaxInr)
      if (filters.durationMinMonths != null) filter.duration_min_months = String(filters.durationMinMonths)
      if (filters.durationMaxMonths != null) filter.duration_max_months = String(filters.durationMaxMonths)

      // Fires once per DISTINCT search — this queryFn only re-runs when `filters` (the query key)
      // actually changes, never on a plain re-render, so this is the "the query/filters actually
      // fired a search" point rather than every keystroke. No raw query text — has_query/filter
      // count only.
      //
      // Platform Pulse enrichment (2026-08-31, same session) — add the chosen FILTER VALUES, but
      // ENUM-SAFE ONLY (recorded PII rule): never `filters.search` (free text). `country` comes
      // from CountrySelect, `level` from a fixed SelectField, `fieldOfStudy` from a MultiSelect
      // over the real catalog fields list — all three are closed vocabularies here, unlike
      // mobile's field-of-study filter (which mixes chips with free text and is excluded there).
      track('search_performed', {
        properties: {
          has_query: Boolean(filters.search),
          filter_count: [
            filters.country,
            filters.level,
            filters.fieldOfStudy?.length ? filters.fieldOfStudy : undefined,
            filters.feeMaxInr,
            // One facet even though a bucket can carry both bounds — same convention mobile's
            // own `_activeFacetCount` uses for the identical filter.
            filters.durationMinMonths ?? filters.durationMaxMonths,
            filters.sort,
          ].filter((v) => v !== undefined && v !== '').length,
          ...(filters.country ? { country: filters.country } : {}),
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
    enabled: isAuthed,
  })
}
