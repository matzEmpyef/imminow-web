import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type CourseInput = components['schemas']['CourseInput']

interface CourseListFilters {
  search?: string
  collegeId?: string
  country?: string
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['courses'] }),
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
    mutationFn: async ({ courseId, payload }: { courseId: string; payload: Record<string, unknown> }) => {
      const { data, error } = await api.POST('/courses/{id}/suggest-correction', {
        params: { path: { id: courseId } },
        body: { payload },
      })
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
