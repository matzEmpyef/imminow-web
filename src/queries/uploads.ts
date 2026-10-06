import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { presignedUpload } from '@/lib/uploads'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

interface UploadsFilters {
  cursor?: string
  limit?: number
}

// Paged since contract gate 7 (newest first, `created_at` then `id`) — replaces the temporary
// `fetchAllPages`-and-reverse read that walked every page just to show the Documents tab oldest
// first. The tab now reads newest first, a page at a time, same as every other paged list in the
// console (Wave 3 plan §7, item 3).
export function useUploads(journeyId: string | undefined, filters: UploadsFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['uploads', journeyId, filters],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/uploads', {
        signal,
        params: { query: { journey_id: journeyId!, limit: filters.limit ?? 20, cursor: filters.cursor } },
      })
      if (error) throw new ApiError('Could not load documents.', error)
      return data
    },
    enabled: isAuthed && Boolean(journeyId),
  })
}

// A case file — the consultancy's own work product going to the student (Documents tab's "Shared
// by us" side; a student's own file_upload-component submission goes through useUploadStepFile
// instead, both landing here). Presigned since contract gate 7 (Wave 3 plan §7): purpose
// `case_upload`, then `POST /uploads` names the completed upload instead of carrying the bytes.
export function useUploadFile(journeyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, linkedStepId }: { file: File; linkedStepId?: string }) => {
      const upload = await presignedUpload({ file, purpose: 'case_upload', journeyId, stepId: linkedStepId })
      const { data, error } = await api.POST('/uploads', {
        body: { file_upload_id: upload.id, journey_id: journeyId, linked_step_id: linkedStepId },
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
      if (error) {
        // 409 file_not_ready / file_quarantined (contract gate 7, BR §3.8) — the server's own
        // message already says which; this is only the fallback for anything else.
        throw new ApiError('Could not get a download link.', error)
      }
      return data.url
    },
  })
}

// User-requested (2026-08-18) — "We should be able to upload the image. No point just giving
// image name." Distinct from useUploadFile above (client case documents, tied to a journey_id) —
// this is for admin-authored marketing/branding images (ad banners, quiz branding placements),
// returning a usable URL directly instead of a separate record to look up later. Not part of the
// presigned upload rework: `POST /media` has no `file_upload_id` path in the contract, it stays
// its own direct multipart route.
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
