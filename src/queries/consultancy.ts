import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type Consultancy = components['schemas']['Consultancy']

export function useMyConsultancy() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['consultancy', 'me'],
    queryFn: async () => {
      const { data, error } = await api.GET('/consultancies/me')
      if (error) throw new ApiError('Could not load consultancy details.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 5 * 60 * 1000,
  })
}

type ConsultancyProfileEdits = Partial<
  Pick<
    Consultancy,
    'logo_url' | 'description' | 'about_us' | 'countries_served' | 'city' | 'country' | 'public_email' | 'public_phone'
  >
>

// Incoming-transfer codes (build reference 1.18, reworked 2026-08-20: the RECEIVING consultancy
// mints the code — "do not involve immiNow admin"). Listed and issued from Consultancy
// Management's Incoming Transfers tab.
export function useTransferCodes(enabled: boolean) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['transfer-codes'],
    queryFn: async () => {
      const { data, error } = await api.GET('/transfer-codes')
      if (error) throw new ApiError('Could not load transfer codes.', error)
      return data
    },
    enabled: isAuthed && enabled,
  })
}

export function useIssueTransferCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { student_email: string; reason: string }) => {
      const { data, error } = await api.POST('/transfer-codes', { body })
      if (error) throw new ApiError('Could not issue a transfer code.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transfer-codes'] }),
  })
}

export function useUpdateConsultancyProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ConsultancyProfileEdits) => {
      const { data, error } = await api.PATCH('/consultancies/me', { body })
      if (error) throw new ApiError('Could not update the consultancy profile.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultancy', 'me'] }),
  })
}

// Consultancy gallery — hero slideshow images shown at the top of Consultancy Detail in the
// Sentpo app (student-facing decision, 2026-08-30). Unlike `logo_url` (a two-step POST /media +
// attach-URL flow), adding a photo is ONE call carrying the image bytes as a base64 `data:` string
// alongside its title/caption — see server.js's comment on why. All three mutations invalidate the
// same `['consultancy', 'me']` query the profile edit above uses, since gallery lives on that same
// Consultancy record.
export function useAddGalleryImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { image_data: string; title?: string | null; caption?: string | null }) => {
      const { data, error } = await api.POST('/consultancies/me/gallery', { body })
      if (error) throw new ApiError('Could not add this photo.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultancy', 'me'] }),
  })
}

export function useUpdateGalleryImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      imageId,
      ...body
    }: {
      imageId: string
      title?: string | null
      caption?: string | null
    }) => {
      const { data, error } = await api.PATCH('/consultancies/me/gallery/{imageId}', {
        params: { path: { imageId } },
        body,
      })
      if (error) throw new ApiError('Could not update this photo.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultancy', 'me'] }),
  })
}

export function useDeleteGalleryImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (imageId: string) => {
      const { error } = await api.DELETE('/consultancies/me/gallery/{imageId}', { params: { path: { imageId } } })
      if (error) throw new ApiError('Could not delete this photo.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultancy', 'me'] }),
  })
}

export function useRequestUpgrade(consultancyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tier?: 'business' | 'ultimate') => {
      const { data, error } = await api.POST('/consultancies/{id}/upgrade-request', {
        params: { path: { id: consultancyId } },
        body: tier ? { tier } : undefined,
      })
      if (error) throw new ApiError('Could not send the upgrade request.', error)
      return data
    },
    // Refetches so `upgrade_requested_tier`/`upgrade_requested_at` (the RECORDED request) show up
    // immediately — the Subscription tab reflects this persisted state, not local mutation state
    // that would forget the moment the page reloads.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultancy', 'me'] }),
  })
}
