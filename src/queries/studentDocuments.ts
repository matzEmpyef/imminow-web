import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type StudentDocument = components['schemas']['StudentDocument']
export type DocumentType = components['schemas']['DocumentType']

/**
 * What this student has shared with THIS consultancy — never their whole locker. Documents belong
 * to the student, not the case, so the consultancy sees exactly what it was granted and nothing
 * else. A case in dispute returns nothing: the freeze takes document access with it.
 */
export function useStudentDocuments(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'student-documents'],
    queryFn: async () => {
      const { data, error } = await api.GET('/clients/{id}/student-documents', {
        params: { path: { id: clientId! } },
      })
      if (error) throw new ApiError('Could not load this student’s documents.', error)
      return data
    },
    enabled: isAuthed && Boolean(clientId),
  })
}

/**
 * Upload on the student's behalf — the consultant scanned their passport at the desk. It lands in
 * the STUDENT's locker and follows them everywhere, because it is their passport. The
 * consultancy's own work product goes through `useUploadFile` instead and stays journey-scoped.
 */
export function useUploadStudentDocument(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      documentTypeId,
      label,
      expiresOn,
    }: {
      file: File
      documentTypeId: string
      label?: string
      expiresOn?: string
    }) => {
      // Same multipart idiom useUploadFile already established — openapi-fetch cannot build a
      // multipart body from the typed schema, so the FormData is passed through verbatim.
      const formData = new FormData()
      formData.append('file', file)
      formData.append('document_type_id', documentTypeId)
      if (label) formData.append('label', label)
      if (expiresOn) formData.append('expires_on', expiresOn)
      const { data, error } = await api.POST('/clients/{id}/student-documents', {
        params: { path: { id: clientId } },
        body: formData as unknown as { file: string; document_type_id: string },
        bodySerializer: () => formData,
      })
      if (error) throw new ApiError('Could not upload this document.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'student-documents'] })
    },
  })
}

export function useDocumentTypes() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['document-types'],
    queryFn: async () => {
      const { data, error } = await api.GET('/document-types')
      if (error) throw new ApiError('Could not load the document catalog.', error)
      return data
    },
    enabled: isAuthed,
  })
}
