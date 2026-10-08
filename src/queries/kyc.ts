import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { guardedFetch } from '@/api/http'
import type { paths } from '@/api/schema'

/** How long the file itself may take to reach storage before the upload is called off. */
const UPLOAD_TIMEOUT_MS = 10 * 60_000

/** The consultancy's own KYC state — drives the Profile tab's certificate card (2026-08-19). */
export function useMyKyc() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['kyc-me'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/consultancies/me/kyc', { signal })
      if (error) throw new ApiError('Could not load your KYC status.', error)
      return data
    },
    enabled: isAuthed,
  })
}

type KycUploadType = paths['/consultancies/me/kyc/upload']['post']['requestBody']['content']['application/json']['content_type']

/** What a certificate may be, and how large (the contract's own list for the upload link). */
export const KYC_FILE_TYPES: readonly KycUploadType[] = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
export const KYC_MAX_BYTES = 10 * 1024 * 1024
export const KYC_FILE_TYPE_MESSAGE = 'Choose a PDF, or a PNG, JPEG or WebP image.'
export const KYC_FILE_SIZE_MESSAGE = 'Choose a file of 10 MB or less.'

function isKycFileType(type: string): type is KycUploadType {
  return (KYC_FILE_TYPES as readonly string[]).includes(type)
}

/** Why this file cannot be a certificate, in words for the form, or null when it can. */
export function kycFileProblem(file: File): string | null {
  if (!isKycFileType(file.type)) return KYC_FILE_TYPE_MESSAGE
  if (file.size < 1 || file.size > KYC_MAX_BYTES) return KYC_FILE_SIZE_MESSAGE
  return null
}

/**
 * Submit (or re-submit) the certificate. Re-submission resets verification server-side.
 *
 * The certificate never has a public copy (review F-066), so it does not go through the image
 * uploader the logo and gallery use. Three steps, in this order:
 *
 *   1. ask for a private upload link, saying exactly what is coming (type and size);
 *   2. PUT the file straight to that link, with exactly that type and size and no sign-in header
 *      (storage refuses anything else);
 *   3. tell the server the upload is finished, by its `upload_id`. The server then checks the
 *      stored bytes really are a PDF or an image.
 */
export function useSubmitKyc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      if (!isKycFileType(file.type)) throw new ApiError(KYC_FILE_TYPE_MESSAGE)
      const { data: link, error: linkError } = await api.POST('/consultancies/me/kyc/upload', {
        body: { content_type: file.type, size_bytes: file.size },
      })
      if (linkError) throw new ApiError('Could not start the upload.', linkError)

      // Not `api.PUT`: the link is absolute and is its own authorisation (as in `presignedUpload`).
      // The browser sets Content-Length from the file itself, which is the size stated in step 1.
      const put = await guardedFetch(link.put_url, {
        timeoutMs: UPLOAD_TIMEOUT_MS,
        method: 'PUT',
        headers: { 'Content-Type': link.content_type },
        body: file,
      })
      if (!put.ok) {
        throw new ApiError('Could not upload the file. Check your connection and try again.', undefined, put.status)
      }

      const { data, error } = await api.POST('/consultancies/me/kyc', { body: { upload_id: link.upload_id } })
      if (error) throw new ApiError('Could not submit the certificate.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kyc-me'] }),
  })
}

/** Super Admin review of one consultancy's submitted certificate. */
export function useConsultancyKyc(consultancyId: string | null) {
  return useQuery({
    queryKey: ['kyc', consultancyId],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/consultancies/{id}/kyc', {
        signal,
        params: { path: { id: consultancyId! } },
      })
      if (error) throw new ApiError('Could not load the KYC record.', error)
      return data
    },
    enabled: consultancyId != null,
  })
}

/** Approve the certificate — flips the kyc_verified badge everywhere, audit-logged server-side. */
export function useVerifyKyc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (consultancyId: string) => {
      const { data, error } = await api.POST('/consultancies/{id}/kyc/verify', {
        params: { path: { id: consultancyId } },
      })
      if (error) throw new ApiError('Could not verify — has a certificate been submitted?', error)
      return data
    },
    onSuccess: (_data, consultancyId) => {
      queryClient.invalidateQueries({ queryKey: ['kyc', consultancyId] })
      queryClient.invalidateQueries({ queryKey: ['admin-consultancies'] })
    },
  })
}
