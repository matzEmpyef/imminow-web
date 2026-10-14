import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

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
 * the words a student typed are not kept (`typed_words` only says that some were). Narrow local
 * type: the generated client does not carry it yet (replace with generated type after the contract
 * join).
 */
export interface NoMatchSearches {
  days: number
  total: number
  top: {
    filters: Record<string, string>
    typed_words: boolean
    searches: number
    last_searched_at: string
  }[]
}

/** The block off a Supply & Demand answer, or null when the answer does not carry it. */
export function noMatchSearchesOf(data: object): NoMatchSearches | null {
  // replace with generated type after the contract join
  const block = (data as { no_match_searches?: NoMatchSearches | null }).no_match_searches
  return block && Array.isArray(block.top) ? block : null
}
