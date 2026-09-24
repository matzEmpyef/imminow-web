import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type CourseInput = components['schemas']['CourseInput']

export type CourseHealthFilter = 'needs_details' | 'complete' | 'missing_requirements'

interface CourseListFilters {
  search?: string
  collegeId?: string
  country?: string
  // College detail's course filters (2026-09-11).
  level?: string
  fieldOfStudy?: string
  active?: boolean
  /** `missing_requirements` = no entry requirements published at all — the Needs-attention
   * card's own definition, narrower than `needs_details` (2026-09-20). */
  health?: CourseHealthFilter
  sort?: string
  cursor?: string
  limit?: number
}

// `collegeId` added (build reference 1.11 — "there will be min 10K colleges or more,"
// user-requested 2026-08-18) — Colleges & Courses' College Detail page needs a real paginated/
// searchable Courses table scoped to one college via filter[college_id], not the old
// fetch-every-course-and-filter-client-side-by-campus_ids approach.
export function useCourses(filters: CourseListFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['courses', filters],
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.collegeId) filter.college_id = filters.collegeId
      if (filters.country) filter.country = filters.country
      if (filters.level) filter.level = filters.level
      if (filters.fieldOfStudy) filter.field_of_study = filters.fieldOfStudy
      if (filters.active !== undefined) filter.active = String(filters.active)
      if (filters.health) filter.health = filters.health

      const { data, error } = await api.GET('/courses', {
        params: {
          query: {
            search: filters.search,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load courses.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/** One course by id — Suggestions Review's "Open course" lands on the college page with `?edit=`
 * and needs the course whether or not it is on the current page of the list (review H13, 2026-09-12). */
export function useCourse(id: string | null) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['course', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/courses/{id}', { params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load that course.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}

export function useCreateCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CourseInput) => {
      const { data, error } = await api.POST('/courses', { body })
      if (error) throw new ApiError('Could not create this course.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      queryClient.invalidateQueries({ queryKey: ['admin-colleges'] })
      queryClient.invalidateQueries({ queryKey: ['admin-college'] })
    },
  })
}

export function useUpdateCourse(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<CourseInput>) => {
      const { data, error } = await api.PATCH('/courses/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this course.', error)
      return data
    },
    // Phase 5 cleanup (2026-09-24): the same breadth as useSetIntakeDeadline below — a course edit showed
    // stale in useCourse's single-course view and in the catalog rollups until they went stale.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      queryClient.invalidateQueries({ queryKey: ['course', id] })
      queryClient.invalidateQueries({ queryKey: ['course-finder'] })
      queryClient.invalidateQueries({ queryKey: ['admin-colleges'] })
      queryClient.invalidateQueries({ queryKey: ['admin-college'] })
      queryClient.invalidateQueries({ queryKey: ['course-suggestions'] })
    },
  })
}

/**
 * Set Intake Deadline (2026-09-18, `PATCH /courses/{id}/intake-deadlines`) — a consultancy that
 * has just talked to the college can set the date itself rather than filing a correction and
 * waiting on a Platform Admin, UNLESS a person changed that same deadline within the last 15
 * days: the server then queues an ordinary `CourseSuggestion` instead (202, `applied: false`) so
 * one consultancy can't silently overwrite another's fresh edit. Same course-shaped result either
 * way (`IntakeDeadlineUpdateResult`), so the caller branches on `applied` rather than on status
 * code — `IntakeDeadlineEditor` (features/clients) does exactly that.
 *
 * Invalidates the same breadth as `useCreateCourse` (course lists, both catalog-health rollups)
 * plus `course-suggestions`, since the 202 branch files one of those too — cheaper to invalidate
 * unconditionally than to special-case the request that actually needed it.
 */
export function useSetIntakeDeadline(courseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    // Month and date only: no `status` since 2026-09-24 — the server derives it from the date.
    mutationFn: async (body: { month: string; application_deadline: string | null }) => {
      const { data, error } = await api.PATCH('/courses/{id}/intake-deadlines', {
        params: { path: { id: courseId } },
        body,
      })
      if (error) throw new ApiError('Could not update this deadline.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      queryClient.invalidateQueries({ queryKey: ['course', courseId] })
      queryClient.invalidateQueries({ queryKey: ['course-finder'] })
      queryClient.invalidateQueries({ queryKey: ['admin-colleges'] })
      queryClient.invalidateQueries({ queryKey: ['admin-college'] })
      queryClient.invalidateQueries({ queryKey: ['course-suggestions'] })
    },
  })
}

export function useCourseSuggestions() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['course-suggestions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/course-suggestions')
      if (error) throw new ApiError('Could not load submission history.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useSuggestCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    // One of the two ids: a course's facts, or (2026-09-10) the college's own.
    mutationFn: async ({
      courseId,
      collegeId,
      payload,
    }: {
      courseId?: string
      collegeId?: string
      payload: Record<string, unknown>
    }) => {
      const { data, error } = collegeId
        ? await api.POST('/colleges/{id}/suggest-correction', { params: { path: { id: collegeId } }, body: { payload } })
        : await api.POST('/courses/{id}/suggest-correction', { params: { path: { id: courseId! } }, body: { payload } })
      if (error) throw new ApiError('Could not submit this correction.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['course-suggestions'] }),
  })
}

export function useSuggestNewCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await api.POST('/courses/suggest-new', { body: { payload } })
      if (error) throw new ApiError('Could not submit this suggestion.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['course-suggestions'] }),
  })
}
