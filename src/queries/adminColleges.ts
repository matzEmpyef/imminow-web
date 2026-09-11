import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type CollegeInput = components['schemas']['CollegeInput']
type CampusInput = components['schemas']['CampusInput']

interface CollegeListFilters {
  // "Needs details" / "Complete" (2026-09-11).
  health?: 'needs_details' | 'complete'
  search?: string
  country?: string[]
  active?: boolean
  sort?: string
  cursor?: string
  limit?: number
}

// Paginated (build reference 1.11 — "there will be min 10K colleges or more," user-requested
// 2026-08-18) — was a single unpaginated `search`-only call that fetched every college with
// campuses embedded inline, the same shape CollegesCoursesPage.tsx used to build a fully
// client-side tree. Mirrors useDocumentLibrary's filter/cursor pattern.
export function useAdminColleges(filters: CollegeListFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-colleges', filters],
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.country?.length) filter.country = filters.country.join(',')
      if (filters.active !== undefined) filter.active = String(filters.active)
      if (filters.health) filter.health = filters.health

      const { data, error } = await api.GET('/colleges', {
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
      if (error) throw new ApiError('Could not load colleges.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// Full detail (campuses embedded) — the paginated list above only ever returns campus_count/
// course_count, never the campus objects themselves, so a college's own page needs this.
export function useCollegeDetail(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-college', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/colleges/{id}', { params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load this college.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}

export function useCreateCollege() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CollegeInput) => {
      const { data, error } = await api.POST('/colleges', { body })
      if (error) throw new ApiError(error.error?.message ?? 'Could not create this college.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-colleges'] }),
  })
}

export function useUpdateCollege(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<CollegeInput>) => {
      const { data, error } = await api.PATCH('/colleges/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError(error.error?.message ?? 'Could not update this college.')
      return data
    },
    // Also invalidates `courses` (2026-08-18) — a course's `visible` is computed from its own
    // active flag AND its college's, so toggling the college stale-caches every course under it
    // otherwise (caught live: the Courses table kept showing a course as visible right after its
    // college went inactive, until this was added).
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-colleges'] })
      queryClient.invalidateQueries({ queryKey: ['admin-college', id] })
      queryClient.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}

export function useCreateCampus(collegeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CampusInput) => {
      const { data, error } = await api.POST('/colleges/{id}/campuses', { params: { path: { id: collegeId } }, body })
      if (error) throw new ApiError('Could not add this campus.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-colleges'] })
      queryClient.invalidateQueries({ queryKey: ['admin-college', collegeId] })
    },
  })
}

export function useUpdateCampus(collegeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ campusId, body }: { campusId: string; body: Partial<CampusInput> }) => {
      const { data, error } = await api.PATCH('/colleges/{id}/campuses/{campusId}', {
        params: { path: { id: collegeId, campusId } },
        body,
      })
      if (error) throw new ApiError('Could not update this campus.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-colleges'] })
      queryClient.invalidateQueries({ queryKey: ['admin-college', collegeId] })
    },
  })
}

export function useImportColleges() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const { data, error } = await api.POST('/colleges/import', {
        params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
        body: formData as unknown as { file?: string },
        bodySerializer: () => formData,
      })
      if (error) throw new ApiError('Could not import this file.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-colleges'] }),
  })
}
