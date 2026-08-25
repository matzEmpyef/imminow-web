import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type JobListingInput = components['schemas']['JobListingInput']

export function useAdminJobs() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-jobs'],
    queryFn: async () => {
      const { data, error } = await api.GET('/jobs')
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
