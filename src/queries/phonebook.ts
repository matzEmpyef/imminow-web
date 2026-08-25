import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function usePhonebook() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['phonebook'],
    queryFn: async () => {
      const { data, error } = await api.GET('/phonebook')
      if (error) throw new ApiError('Could not load the phonebook.', error)
      return data
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
