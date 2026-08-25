import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type FormFieldInput = components['schemas']['FormFieldInput']

export function useFormTemplates() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['form-templates'],
    queryFn: async () => {
      const { data, error } = await api.GET('/form-templates')
      if (error) throw new ApiError('Could not load form templates.')
      return data
    },
    enabled: isAuthed,
  })
}

export function useFormTemplate(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['form-templates', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/form-templates/{id}', { params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load this form template.')
      return data
    },
    enabled: isAuthed && Boolean(id),
  })
}

export function useCreateFormTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; fields: FormFieldInput[] }) => {
      const { data, error } = await api.POST('/form-templates', { body })
      if (error) throw new ApiError('Could not create this form template.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['form-templates'] }),
  })
}

export function useUpdateFormTemplate(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name?: string; fields?: FormFieldInput[] }) => {
      const { data, error } = await api.PATCH('/form-templates/{id}', {
        params: { path: { id } },
        body,
      })
      if (error) throw new ApiError('Could not update this form template.')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] })
      queryClient.invalidateQueries({ queryKey: ['form-templates', id] })
    },
  })
}

export function useDuplicateFormTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/form-templates/{id}/duplicate', {
        params: { path: { id } },
      })
      if (error) throw new ApiError('Could not duplicate this form template.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['form-templates'] }),
  })
}
