import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

interface DocumentLibraryFilters {
  tag?: string
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
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.tag) filter.tag = filters.tag
      if (filters.mimeType) filter.mime_type = filters.mimeType
      if (filters.from) filter.from = filters.from
      if (filters.to) filter.to = filters.to

      const { data, error } = await api.GET('/document-library', {
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
      if (error) throw new ApiError('Could not load the document library.')
      return data
    },
    enabled: isAuthed,
  })
}

export function useUploadLibraryDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const { data, error } = await api.POST('/document-library', {
        body: formData as unknown as { file: string },
        bodySerializer: () => formData,
      })
      if (error) throw new ApiError('Could not upload this document.')
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
      if (error) throw new ApiError('Could not update tags for this document.')
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
      if (error) throw new ApiError(error.error.message)
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
      if (error) throw new ApiError('Could not get a download link.')
      return data.url
    },
  })
}

export function useDeleteLibraryDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/document-library/{id}', { params: { path: { id } } })
      if (error) throw new ApiError('Could not delete this document.')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-library'] }),
  })
}
