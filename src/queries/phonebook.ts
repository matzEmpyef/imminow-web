import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type PhonebookContact = components['schemas']['PhonebookContact']

export function usePhonebook() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['phonebook'],
    queryFn: async (): Promise<PhonebookContact[]> => {
      const { data, error } = await api.GET('/phonebook')
      if (error) throw new ApiError('Could not load the phonebook.', error)
      // Contract gate 9 paged this endpoint ({items, meta}); the real backend returns that shape,
      // but the mock is frozen post-Wave-3 and still answers the pre-gate-9 bare array. Unwrap
      // whichever comes back — full paging (search/filter/load-more) is Wave 4 client work.
      const payload: unknown = data
      return Array.isArray(payload)
        ? (payload as PhonebookContact[])
        : ((payload as { items?: PhonebookContact[] })?.items ?? [])
    },
    enabled: isAuthed,
  })
}

export function useCreatePhonebookContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; category: string; phone: string; email?: string }) => {
      const { data, error } = await api.POST('/phonebook', { body })
      if (error) throw new ApiError('Could not add this contact.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['phonebook'] }),
  })
}

export function useDeletePhonebookContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/phonebook/{id}', { params: { path: { id } } })
      if (error) throw new ApiError('Could not remove this contact.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['phonebook'] }),
  })
}
