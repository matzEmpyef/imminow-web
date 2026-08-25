import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from './auth'
import { useAuthStore } from '@/stores/authStore'
import type { components } from '@/api/schema'

export type CountryContent = components['schemas']['CountryContent']

const KEY = ['country-content']

/** Every write-up including drafts — admin only. */
export function useCountryContent() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await api.GET('/country-content', {})
      if (error) throw new ApiError('Could not load the country write-ups.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/**
 * Upsert — there is at most one write-up per country, so the country name IS the identity and the
 * caller never has to know whether a record already exists.
 */
export function useSaveCountryContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      country,
      ...body
    }: {
      country: string
      summary?: string | null
      body_html?: string | null
      published?: boolean
    }) => {
      const { data, error } = await api.PUT('/country-content/{country}', {
        params: { path: { country } },
        body,
      })
      // The server rejects a country outside the shared Countries list with a 422 naming the
      // problem — surfaced verbatim, since "could not save" would hide the one thing that fixes it.
      if (error) throw new ApiError(error.error?.message ?? 'Could not save this write-up.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteCountryContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (country: string) => {
      const { error } = await api.DELETE('/country-content/{country}', {
        params: { path: { country } },
      })
      if (error) throw new ApiError('Could not remove this write-up.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}
