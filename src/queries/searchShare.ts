import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from './auth'

export interface ShareSearchInput {
  // GET /courses `filter[...]` keys, as Course Finder holds them.
  filters: Record<string, string>
  search?: string
}

// "Send this search" (2026-09-14) — posts a Course Finder search into the person's chat as a
// search card. The server decides what the Sentpo app can apply and names the rest on the card.
export function useShareSearch(kind: 'lead' | 'client', id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ShareSearchInput) => {
      const { data, error } =
        kind === 'lead'
          ? await api.POST('/leads/{id}/share-search', { params: { path: { id } }, body })
          : await api.POST('/clients/{id}/share-search', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not send this search.', error)
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [kind === 'lead' ? 'leads' : 'clients', id, 'messages'] }),
  })
}
