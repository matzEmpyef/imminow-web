import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import { guardedFetch } from '@/api/http'
import type { paths } from '@/api/schema'
import { UPLOAD_RULES, uploadProblem, uploadSentence } from '@/lib/uploadRules'

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
export const KYC_MAX_BYTES = UPLOAD_RULES.kyc.maxBytes

function isKycFileType(type: string): type is KycUploadType {
  return (KYC_FILE_TYPES as readonly string[]).includes(type)
}

/** Why this file cannot be a certificate, in words for the form, or null when it can. */
export function kycFileProblem(file: File): string | null {
  return uploadProblem(file, 'kyc')
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
      if (!isKycFileType(file.type)) throw new ApiError(uploadSentence('kyc'))
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

/** What the reviewer reads when the consultancy sent another certificate while this one was open. */
export const KYC_NEWER_CERTIFICATE_NOTICE = 'A newer certificate was submitted. Please review it.'

/** What a 409 reads when the server's own sentence is missing: a newer certificate, or already decided. */
function conflictFallback(code: string | undefined): string {
  return code === 'conflict' ? KYC_NEWER_CERTIFICATE_NOTICE : 'This certificate has already been reviewed.'
}

/**
 * Approve the certificate — flips the kyc_verified badge everywhere, audit-logged server-side.
 *
 * The request names the certificate the reviewer is looking at, by its `uploaded_at` exactly as
 * the review row was served it (review F-207). When the consultancy has submitted another one
 * since, the server answers 409 `conflict` and verifies nothing; a certificate already verified or
 * rejected answers 409 `already_reviewed`. Either way the row is read again so the certificate as
 * it now stands is the one on screen, and the reviewer reads the server's own sentence (the
 * constant below is only the fallback when the answer carries none).
 */
export function useVerifyKyc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ consultancyId, uploadedAt }: { consultancyId: string; uploadedAt: string }) => {
      const { data, error, response } = await api.POST('/consultancies/{id}/kyc/verify', {
        params: { path: { id: consultancyId } },
        body: { uploaded_at: uploadedAt },
      })
      if (error) {
        // 409 `conflict` (a newer certificate) and 409 `already_reviewed` (verified or rejected in
        // the meantime) each carry their own sentence: that is what the reviewer reads.
        if (response?.status === 409) throw new ApiError(conflictFallback(error.error?.code), error, 409)
        throw new ApiError('Could not verify — has a certificate been submitted?', error, response?.status)
      }
      return data
    },
    onSuccess: (_data, { consultancyId }) => {
      queryClient.invalidateQueries({ queryKey: ['kyc', consultancyId] })
      queryClient.invalidateQueries({ queryKey: ['admin-consultancies'] })
      // The Needs attention "KYC to verify" count falls by one (review F-314).
      queryClient.invalidateQueries({ queryKey: ['admin-attention'] })
    },
    // A newer certificate arrived, or someone reviewed it first: show the row as it now stands.
    onError: (err, { consultancyId }) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['kyc', consultancyId] })
      }
    },
  })
}

/**
 * Turn the submitted certificate down, with a reason the consultancy is shown (review I-010). The
 * consultancy is told and submits again. Only a certificate still waiting for review can be
 * rejected: 409 `already_reviewed` once it is verified or already rejected, and the server's own
 * sentence is what the reviewer reads.
 *
 * Like Verify, the request names the certificate the reviewer opened, by its `uploaded_at` exactly
 * as served; if another was submitted since, 409 `conflict` and nothing is rejected.
 */
export function useRejectKyc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      consultancyId,
      reason,
      uploadedAt,
    }: {
      consultancyId: string
      reason: string
      uploadedAt: string
    }) => {
      const { data, error, response } = await api.POST('/consultancies/{id}/kyc/reject', {
        params: { path: { id: consultancyId } },
        body: { reason, uploaded_at: uploadedAt },
      })
      if (error) {
        const fallback = response?.status === 409 ? conflictFallback(error.error?.code) : 'Could not reject the certificate.'
        throw new ApiError(fallback, error, response?.status)
      }
      return data
    },
    onSuccess: (_data, { consultancyId }) => {
      queryClient.invalidateQueries({ queryKey: ['kyc', consultancyId] })
      queryClient.invalidateQueries({ queryKey: ['admin-consultancies'] })
      // It is no longer waiting for a review, so the "KYC to verify" count falls by one.
      queryClient.invalidateQueries({ queryKey: ['admin-attention'] })
    },
    // Someone else reviewed it first, or a newer certificate arrived: show the row as it now stands.
    onError: (err, { consultancyId }) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['kyc', consultancyId] })
      }
    },
  })
}
