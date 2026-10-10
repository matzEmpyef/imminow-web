import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { requireVersion } from '@/lib/staleEdit'
import type { components } from '@/api/schema'

type FormFieldInput = components['schemas']['FormFieldInput']

export function useFormTemplates() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['form-templates'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/form-templates', { signal })
      if (error) throw new ApiError('Could not load form templates.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useFormTemplate(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['form-templates', id],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/form-templates/{id}', { signal, params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load this form template.', error)
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
      if (error) throw new ApiError('Could not create this form template.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['form-templates'] }),
  })
}

export function useUpdateFormTemplate(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      name?: string
      fields?: FormFieldInput[]
      // Optimistic lock (contract gate 7, BR §3.6) — the version the edit started from. REQUIRED
      // by the server since 2026-10-10 (400 without it); stale, it answers 409 `version_conflict`.
      version: number | undefined
    }) => {
      const { data, error } = await api.PATCH('/form-templates/{id}', {
        params: { path: { id } },
        body: { ...body, version: requireVersion(body.version) },
      })
      if (error) throw new ApiError('Could not update this form template.', error)
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
      if (error) throw new ApiError('Could not duplicate this form template.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['form-templates'] }),
  })
}

// Restore default (owner decisions 30/31): puts the consultancy's default form back to the
// standard application form. No body. The server answers with the default's latest version: a
// NEW version (new id) when it had to write one, or the same form untouched when it was already
// standard, so the caller compares ids to say which happened.
export function useRestoreDefaultFormTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/form-templates/restore-default')
      if (error) throw new ApiError('Could not restore the default form.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['form-templates'] }),
  })
}
