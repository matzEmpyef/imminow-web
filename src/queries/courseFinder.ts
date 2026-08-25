import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
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
  fieldOfStudy?: string
  feeMaxInr?: number
  sort?: string
}

export function useCourseFinder(filters: CourseFinderFilters) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['course-finder', filters],
    queryFn: async () => {
      const filter: Record<string, string> = { visible: 'true' }
      if (filters.country) filter.country = filters.country
      if (filters.level) filter.level = filters.level
      if (filters.fieldOfStudy) filter.field_of_study = filters.fieldOfStudy
      if (filters.feeMaxInr) filter.fee_max = String(filters.feeMaxInr)

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
      if (error) throw new ApiError('Could not load courses.')
      return data
    },
    // No applicant required (user, 2026-08-23). A consultant researching for a LEAD must be able
    // to search the catalog without attaching a client record — a lead has not shared a profile,
    // and demanding one to browse courses would mean either inventing a record or not searching.
    // `eligibility_for` is already optional; without it the server simply returns no fit data.
    enabled: isAuthed,
  })
}
