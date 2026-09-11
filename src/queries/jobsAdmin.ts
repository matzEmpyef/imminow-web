import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type JobListingInput = components['schemas']['JobListingInput']

export interface JobListFilters {
  search?: string
  /** live | scheduled | expired | off, comma-separated = any of. */
  status?: string
  jobType?: string
  workMode?: string
  category?: string
  sort?: string
  cursor?: string
  limit?: number
}

// Server-side search/filter/paging (2026-09-11) — this used to call GET /jobs with no params at
// all, so the admin only ever saw the first 20 of however many listings existed and could not
// find or edit the rest. Cursor-paged the same way every other admin list is.
export function useAdminJobs(filters: JobListFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-jobs', filters],
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.jobType) filter.job_type = filters.jobType
      if (filters.workMode) filter.work_mode = filters.workMode
      if (filters.category) filter.category = filters.category
      const { data, error } = await api.GET('/jobs', {
        params: {
          query: {
            search: filters.search || undefined,
            'filter[status]': filters.status || undefined,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            sort: filters.sort || undefined,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load job listings.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: JobListingInput) => {
      const { data, error } = await api.POST('/jobs', { body })
      if (error) throw new ApiError('Could not create this listing.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-jobs'] }),
  })
}

export function useUpdateJob(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<JobListingInput>) => {
      const { data, error } = await api.PATCH('/jobs/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this listing.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-jobs'] }),
  })
}
