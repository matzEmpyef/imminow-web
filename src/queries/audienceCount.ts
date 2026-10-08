import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/authStore'
import { useDebouncedValue } from '@/lib/useDebounce'
import type { components, paths } from '@/api/schema'

type Targeting = components['schemas']['Targeting']
type BroadcastAudience = paths['/broadcast/audience-count']['post']['requestBody']['content']['application/json']['audience']
type CountQuery = NonNullable<paths['/events/audience-count']['get']['parameters']['query']>

/** Which form is asking: each surface has its own route and its own rule for unknown student data. */
export type AudienceSurface = 'ads' | 'events' | 'broadcast'

export interface AudienceCount {
  /** About how many people the draft reaches. Null while it is being counted, and when there is no number to show. */
  count: number | null
  /** A count for what is on screen now is on its way. */
  isCounting: boolean
  /** The count could not be read (not a refused half-filled form: that shows nothing). */
  isError: boolean
}

const COUNT_DEBOUNCE_MS = 400

// An empty list or an unset value places no restriction, so it is left out of the request.
const list = (values: string[] | null | undefined) => (values?.length ? values : undefined)

/** The fields of a targeting document as the two GET count routes take them. */
function countQuery(t: Targeting): CountQuery {
  return {
    resident_country: list(t.resident_country),
    state: list(t.state),
    district: list(t.district),
    city: list(t.city),
    target_country: list(t.target_country),
    study_level: list(t.study_level),
    institution_id: list(t.institution_id),
    gender: t.gender ?? undefined,
    min_age: t.min_age ?? undefined,
    max_age: t.max_age ?? undefined,
    stage: t.stage ?? undefined,
    case_type: t.case_type ?? undefined,
    joined_within_days: t.joined_within_days ?? undefined,
    dormant_days: t.dormant_days ?? undefined,
  }
}

/**
 * The expected audience of a draft, live as its "who can see" targeting is edited (owner decision
 * 20, 2026-10-07): ONE hook for ads, broadcasts and events (quizzes, webinars, in-person
 * meetings). Ads and broadcasts each had their own copy; events had none.
 *
 *   - Debounced: the filter has free-text controls, and a request per keystroke is a count nobody
 *     saw land. What is debounced is the document's VALUE, so a caller passing a new object on
 *     every render does not keep the timer from ever finishing.
 *   - A superseded request is cancelled (the query's `signal`), so an older answer never lands
 *     over a newer one.
 *   - 422 means the document is not valid YET (a form half filled in): there is no number, and
 *     nothing is shown. It is not asked again until the document changes.
 *
 * `broadcastAudience` is read for `broadcast` only: "all students" and "all staff" are counted by
 * the same route with no targeting.
 */
export function useAudienceCount(
  surface: AudienceSurface,
  targeting: Targeting,
  broadcastAudience: BroadcastAudience = 'segment',
): AudienceCount {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  // "All students" and "all staff" are counted with no document at all.
  const segment = surface !== 'broadcast' || broadcastAudience === 'segment'
  const documentKey = JSON.stringify(targeting)
  const settledKey = useDebouncedValue(documentKey, COUNT_DEBOUNCE_MS)
  const audience = surface === 'broadcast' ? broadcastAudience : null

  const query = useQuery({
    queryKey: ['audience-count', surface, audience, segment ? settledKey : null],
    queryFn: async ({ signal }): Promise<number | null> => {
      const document: Targeting = JSON.parse(settledKey)
      const { data, error } =
        surface === 'broadcast'
          ? await api.POST('/broadcast/audience-count', {
              signal,
              body: { audience: broadcastAudience, targeting: segment ? document : undefined },
            })
          : await api.GET(surface === 'ads' ? '/ads/audience-count' : '/events/audience-count', {
              signal,
              params: { query: countQuery(document) },
            })
      if (error) {
        const refusal = new ApiError('Could not compute the matching audience.', error)
        if (refusal.status === 422) return null
        throw refusal
      }
      return typeof data?.count === 'number' ? data.count : null
    },
    enabled: isAuthed,
  })

  // Until the pause has passed, the number held belongs to the previous document.
  const settled = !segment || settledKey === documentKey
  return {
    count: settled ? (query.data ?? null) : null,
    isCounting: !settled || query.isLoading,
    isError: settled && query.isError,
  }
}
