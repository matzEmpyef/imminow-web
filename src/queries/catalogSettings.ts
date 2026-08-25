import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type ExamInput = components['schemas']['ExamInput']

// Admin-managed exams catalog (COURSES_MODULE_PLAN.md §1.3) — one list feeds both the student
// app's Add-exam dropdown and the course requirements form, so an admin adding "CUET" here
// makes it usable everywhere with no developer involved.
export function useExams() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['exams'],
    queryFn: async () => {
      const { data, error } = await api.GET('/exams')
      if (error) throw new ApiError('Could not load the exams catalog.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 10 * 60 * 1000,
  })
}

export function useCreateExam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ExamInput) => {
      const { data, error } = await api.POST('/exams', { body })
      if (error) throw new ApiError('Could not add this exam.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  })
}

export function useUpdateExam(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<ExamInput>) => {
      const { data, error } = await api.PATCH('/exams/{id}', {
        params: { path: { id } },
        body: body as ExamInput,
      })
      if (error) throw new ApiError('Could not update this exam.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  })
}

// Platform exchange-rate table (plan §1.5) — a rate change re-materializes every course's
// normalized INR fee, which is what the app's fee filter/sort compare against.
export function useExchangeRates() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['exchange-rates'],
    queryFn: async () => {
      const { data, error } = await api.GET('/exchange-rates')
      if (error) throw new ApiError('Could not load exchange rates.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 10 * 60 * 1000,
  })
}

export function useUpsertExchangeRate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ currency, inr_per_unit }: { currency: string; inr_per_unit: number }) => {
      const { data, error } = await api.PUT('/exchange-rates/{currency}', {
        params: { path: { currency } },
        body: { inr_per_unit },
      })
      if (error) throw new ApiError('Could not save this rate.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] })
      queryClient.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}

// Platform-wide display settings. Readable by anyone signed in (the student app needs to know
// whether to render view counts); writable only with the `catalog` platform permission.
export function usePlatformSettings() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await api.GET('/platform/settings')
      if (error) throw new ApiError('Could not load platform settings.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { show_course_view_counts?: boolean }) => {
      const { data, error } = await api.PATCH('/platform/settings', { body })
      if (error) throw new ApiError('Could not save this setting.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-settings'] }),
  })
}
