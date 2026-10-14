import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

// docs/PROGRESS.md §4 Step 4 — gated to any platform account (requirePlatformAccount server-side),
// same as the landing Platform Dashboard, not one specific permission flag.
export function useSupplyDemand() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-supply-demand'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/admin/supply-demand', { signal })
      if (error) throw new ApiError('Could not load supply/demand data.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/**
 * Student course searches that found nothing (`SupplyDemandResponse.no_match_searches`): how many in
 * the last `days` days and the commonest filter combinations. A count of searches, never of people;
 * the words a student typed are not kept (`typed_words` only says that some were).
 */
export type NoMatchSearches = components['schemas']['SupplyDemandResponse']['no_match_searches']

/** The block off a Supply & Demand answer, or null when the answer does not carry it. */
export function noMatchSearchesOf(data: Pick<components['schemas']['SupplyDemandResponse'], 'no_match_searches'>): NoMatchSearches | null {
  const block = data.no_match_searches
  return block && Array.isArray(block.top) ? block : null
}
