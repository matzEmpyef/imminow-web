import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type PhonebookContact = components['schemas']['PhonebookContact']

export interface PhonebookResult {
  items: PhonebookContact[]
  /** Every category value in use across the caller's whole list (contract gate 9, K13, owner
   * Q10) — from `meta.categories` once the backend sends it; derived from the fetched page as a
   * fallback against the mock, which still answers the pre-gate-9 bare array (see below). */
  categories: string[]
}

/**
 * Contract gate 9, K13 paged this endpoint (`{items, meta}`, `meta.categories`) — the mock (frozen
 * post-Wave-3) still answers the pre-gate-9 bare array unconditionally, ignoring
 * `limit`/`cursor`/`search`/`filter[category]` entirely (it only honours the deprecated bare
 * `category` param, and even that only when nothing paginated is asked for). `limit` is sent to
 * opt into the new response shape per the contract's own "transition" note; both response shapes
 * are unwrapped. `PhonebookPage` still filters/searches/sorts client-side over the result — the
 * mock narrows nothing server-side regardless of what's sent, so that's what makes search and the
 * category filter actually work today (harmless once a real backend narrows it too: filtering an
 * already-filtered list is a no-op). True cursor paging ("load more") is left for whenever the
 * backend actually honours `limit` — an endpoint that always returns everything has nothing to
 * page yet.
 */
export function usePhonebook() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['phonebook'],
    queryFn: async (): Promise<PhonebookResult> => {
      const { data, error } = await api.GET('/phonebook', { params: { query: { limit: 100 } } })
      if (error) throw new ApiError('Could not load the phonebook.', error)
      const payload: unknown = data
      const items = Array.isArray(payload)
        ? (payload as PhonebookContact[])
        : ((payload as { items?: PhonebookContact[] })?.items ?? [])
      const serverCategories = !Array.isArray(payload)
        ? (payload as { meta?: { categories?: string[] } })?.meta?.categories
        : undefined
      const categories = serverCategories ?? [...new Set(items.map((c) => c.category))]
      return { items, categories }
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
