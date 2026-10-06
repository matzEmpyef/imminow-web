import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { presignedUpload } from '@/lib/uploads'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

interface DocumentLibraryFilters {
  tag?: string[]
  mimeType?: string
  from?: string
  to?: string
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useDocumentLibrary(filters: DocumentLibraryFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['document-library', filters],
    queryFn: async ({ signal }) => {
      const filter: Record<string, string> = {}
      if (filters.tag?.length) filter.tag = filters.tag.join(',')
      if (filters.mimeType) filter.mime_type = filters.mimeType
      if (filters.from) filter.from = filters.from
      if (filters.to) filter.to = filters.to

      const { data, error } = await api.GET('/document-library', {
        signal,
        params: {
          query: {
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load the document library.', error)
      return data
    },
    enabled: isAuthed,
  })
}

// Presigned since contract gate 7 (Wave 3 plan §7): purpose `library`, gated the same way
// `POST /file-uploads` itself gates it (the document_library feature, consultancy staff only).
export function useUploadLibraryDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const upload = await presignedUpload({ file, purpose: 'library' })
      const { data, error } = await api.POST('/document-library', {
        body: { file_upload_id: upload.id },
      })
      if (error) throw new ApiError('Could not upload this document.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-library'] }),
  })
}

export function useSetLibraryDocumentTags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      const { data, error } = await api.PATCH('/document-library/{id}/tags', {
        params: { path: { id } },
        body: { tags },
      })
      if (error) throw new ApiError('Could not update tags for this document.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-library'] }),
  })
}

export function useShareLibraryDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, journeyId }: { id: string; journeyId: string }) => {
      const { data, error } = await api.POST('/document-library/{id}/share', {
        params: { path: { id } },
        body: { journey_id: journeyId },
      })
      // Surfaces the server's own message (e.g. "already shared") rather than a generic one —
      // the frontend picker already disables proactively, so this mainly covers the race
      // between two open tabs (user-requested duplicate-share guard, 2026-08-19).
      if (error) throw new ApiError('Could not share this document.', error)
      return data
    },
    // Wasn't invalidated before (Document Library page never needed it since it doesn't show the
    // target client's own Documents tab) — needed now that Documents tab itself can trigger a
    // share (user-requested, 2026-08-15) and expects to see the result immediately.
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ['uploads', variables.journeyId] }),
  })
}

export function useDownloadLibraryDocumentUrl() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.GET('/document-library/{id}', { params: { path: { id } } })
      if (error) throw new ApiError('Could not get a download link.', error)
      return data.url
    },
  })
}

export function useDeleteLibraryDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/document-library/{id}', { params: { path: { id } } })
      if (error) throw new ApiError('Could not delete this document.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-library'] }),
  })
}
