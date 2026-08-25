import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// Support Tools' cross-consultancy list of in-person visit requests (2026-08-24, "for super
// admin use a dedicated page"). `responded` is server-computed from the conversation's own
// unattended state — there is no status to PATCH here, unlike Complaints; the consultant
// replying in the actual chat thread is the resolution.
export function useVisitRequests(responded: boolean | null) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['visit-requests', responded],
    queryFn: async () => {
      const { data, error } = await api.GET('/visit-requests', {
        params: { query: responded === null ? {} : { filter: { responded: responded ? 'true' : 'false' } } },
      })
      if (error) throw new ApiError('Could not load visit requests.', error)
      return data
    },
    enabled: isAuthed,
  })
}
