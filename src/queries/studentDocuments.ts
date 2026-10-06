import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { presignedUpload } from '@/lib/uploads'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

export type StudentDocument = components['schemas']['StudentDocument']

/**
 * What this student has shared with THIS consultancy — never their whole locker. Documents belong
 * to the student, not the case, so the consultancy sees exactly what it was granted and nothing
 * else. A case in dispute returns nothing: the freeze takes document access with it.
 */
export function useStudentDocuments(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'student-documents'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/clients/{id}/student-documents', {
        signal,
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
 *
 * Presigned since contract gate 7 (Wave 3 plan §7): the intent is started with purpose `locker`
 * AND this case's `journey_id` — required for staff uploading on the student's behalf — so the
 * upload can only be attached to this one case's student-documents call.
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
      const upload = await presignedUpload({ file, purpose: 'locker', journeyId: clientId, documentTypeId })
      const { data, error } = await api.POST('/clients/{id}/student-documents', {
        params: { path: { id: clientId } },
        body: {
          file_upload_id: upload.id,
          document_type_id: documentTypeId,
          label: label ?? undefined,
          expires_on: expiresOn ?? undefined,
        },
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
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/document-types', { signal })
      if (error) throw new ApiError('Could not load the document catalog.', error)
      return data
    },
    enabled: isAuthed,
  })
}
