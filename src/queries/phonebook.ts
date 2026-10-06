import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export interface PhonebookFilters {
  search?: string
  category?: string
  cursor?: string
}

/**
 * Contract gate 9, K13 — `GET /phonebook` is paged (`{items, meta}`) and narrows on the server:
 * `search` matches name, phone and email, `filter[category]` is an exact match. `meta.categories`
 * is every category in use across the caller's whole list (owner Q10), so the picker stays
 * complete on a filtered or paged result. The list has no `sort` param (it comes back by name);
 * `PhonebookPage` orders the page it holds, hence the largest page the contract allows.
 */
export function usePhonebook(filters: PhonebookFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['phonebook', filters],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/phonebook', {
        signal,
        params: {
          query: {
            search: filters.search,
            'filter[category]': filters.category,
            cursor: filters.cursor,
            limit: 100,
          },
        },
      })
      if (error) throw new ApiError('Could not load the phonebook.', error)
      return data
    },
    enabled: isAuthed,
    // The category picker is built from the reply; keep the last one while the next loads so the
    // picker (and the rows) don't blink out on every keystroke or filter change.
    placeholderData: keepPreviousData,
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
