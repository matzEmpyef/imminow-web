import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useUploads(journeyId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['uploads', journeyId],
    queryFn: async () => {
      const { data, error } = await api.GET('/uploads', {
        params: { query: { journey_id: journeyId! } },
      })
      if (error) throw new ApiError('Could not load documents.', error)
      return data
    },
    enabled: isAuthed && Boolean(journeyId),
  })
}

export function useUploadFile(journeyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, linkedStepId }: { file: File; linkedStepId?: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('journey_id', journeyId)
      if (linkedStepId) formData.append('linked_step_id', linkedStepId)
      const { data, error } = await api.POST('/uploads', {
        body: formData as unknown as { file: string; journey_id: string },
        bodySerializer: () => formData,
      })
      if (error) throw new ApiError('Could not upload this file.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uploads', journeyId] }),
  })
}

export function useDownloadUrl() {
  return useMutation({
    mutationFn: async (uploadId: string) => {
      const { data, error } = await api.GET('/uploads/{id}', { params: { path: { id: uploadId } } })
      if (error) throw new ApiError('Could not get a download link.', error)
      return data.url
    },
  })
}

// User-requested (2026-08-18) — "We should be able to upload the image. No point just giving
// image name." Distinct from useUploadFile above (client case documents, tied to a journey_id) —
// this is for admin-authored marketing/branding images (ad banners, quiz branding placements),
// returning a usable URL directly instead of a separate record to look up later.
export function useUploadMedia() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const { data, error } = await api.POST('/media', {
        body: formData as unknown as { file: string },
        bodySerializer: () => formData,
      })
      if (error) throw new ApiError('Could not upload this image.', error)
      return data.url
    },
  })
}
