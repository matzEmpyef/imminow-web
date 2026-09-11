import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type AdBannerInput = components['schemas']['AdBannerInput']
type AdTargeting = components['schemas']['Targeting']

export function useAdminAds() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-ads'],
    queryFn: async () => {
      const { data, error } = await api.GET('/ads')
      if (error) throw new ApiError('Could not load ads.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// Who clicked an ad (user 2026-08-20) — fetched only while the drill-down popup is open.
export function useAdClicks(adId: string | null) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['ads', adId, 'clicks'],
    queryFn: async () => {
      const { data, error } = await api.GET('/ads/{id}/clicks', { params: { path: { id: adId! } } })
      if (error) throw new ApiError('Could not load ad clicks.', error)
      return data
    },
    enabled: isAuthed && Boolean(adId),
  })
}

export function useCreateAd() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: AdBannerInput) => {
      const { data, error } = await api.POST('/ads', { body })
      if (error) throw new ApiError('Could not create this ad.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ads'] }),
  })
}

// User-requested (2026-08-18) — "We need to see how many matching that condition are there in
// the system when we apply this condition." Queried live as the admin edits Targeting on
// Add/Edit Ad; the object identity of `targeting` changes on every keystroke/chip add, so the
// query key is derived from its actual values, not the object reference, to avoid refetching
// more than the fields that actually changed warrant (react-query does this by default via
// JSON-serializing the key, so passing `targeting` directly here is already correct).
//
// 2026-09-11 — GET /ads/audience-count now accepts every field TargetingFilter can set for ads
// (state/district/city/institution_id/gender/min_age/max_age added); this was only sending 5 of
// the 12, so the estimate silently ignored whatever the admin narrowed with those fields.
export function useAdAudienceCount(targeting: AdTargeting) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['ad-audience-count', targeting],
    queryFn: async () => {
      const { data, error } = await api.GET('/ads/audience-count', {
        params: {
          query: {
            resident_country: targeting.resident_country?.length ? targeting.resident_country : undefined,
            state: targeting.state?.length ? targeting.state : undefined,
            district: targeting.district?.length ? targeting.district : undefined,
            city: targeting.city?.length ? targeting.city : undefined,
            target_country: targeting.target_country?.length ? targeting.target_country : undefined,
            study_level: targeting.study_level?.length ? targeting.study_level : undefined,
            institution_id: targeting.institution_id?.length ? targeting.institution_id : undefined,
            gender: targeting.gender ?? undefined,
            min_age: targeting.min_age ?? undefined,
            max_age: targeting.max_age ?? undefined,
            stage: targeting.stage ?? undefined,
            case_type: targeting.case_type ?? undefined,
          },
        },
      })
      if (error) throw new ApiError('Could not compute the matching audience.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useUpdateAd(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<AdBannerInput>) => {
      const { data, error } = await api.PATCH('/ads/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this ad.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ads'] }),
  })
}

// New (2026-09-11) — DELETE /ads/{id} is permanent, unlike PATCH { active: false } which just
// stops serving the ad and stays reversible. Kept as its own mutation, not folded into
// useUpdateAd, so the two can never be confused at a call site.
export function useDeleteAd() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/ads/{id}', { params: { path: { id } } })
      if (error) throw new ApiError('Could not delete this ad.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ads'] }),
  })
}
