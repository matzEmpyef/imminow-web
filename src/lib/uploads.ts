import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

export type FileUploadPurpose = components['schemas']['FileUploadIntentInput']['purpose']
export type FileUpload = components['schemas']['FileUpload']

export interface PresignedUploadInput {
  file: File
  purpose: FileUploadPurpose
  /** `case_upload` always; `locker` only when staff upload on the student's behalf. */
  journeyId?: string
  /** `case_upload` only — links the upload to one step's `file_upload` component. */
  stepId?: string
  /** `locker` only. */
  documentTypeId?: string
}

/**
 * The presigned three-step upload every console upload flow now shares (contract gate 7, Wave 3
 * plan §7): `POST /file-uploads` says what is coming, the client PUTs the bytes straight to the
 * returned `put_url` (never through this API), then `POST /file-uploads/{id}/complete` checks them
 * and queues the antivirus scan. One function instead of four near-identical multipart POSTs, so a
 * scan-status refusal reads the same way on a case file, a locker document and a library upload.
 *
 * Returns the completed `FileUpload` — `stored` or `clean` — so the caller passes its `id` as
 * `file_upload_id` to its own create operation (`POST /uploads`, `/clients/{id}/student-documents`,
 * `/document-library`). Throws before the caller ever gets that far when the scan already found
 * something (`quarantined`) — the EICAR test string is the only way to see that against the mock.
 */
export async function presignedUpload({
  file,
  purpose,
  journeyId,
  stepId,
  documentTypeId,
}: PresignedUploadInput): Promise<FileUpload> {
  const { data: intent, error: intentError } = await api.POST('/file-uploads', {
    body: {
      purpose,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      journey_id: journeyId,
      step_id: stepId,
      document_type_id: documentTypeId,
    },
  })
  if (intentError) throw new ApiError('Could not start this upload.', intentError)

  // Not `api.PUT` — `put_url` is already absolute (points at wherever object storage lives) and
  // the presigned PUT carries no bearer token (BR §3.8): the token in its own query string is the
  // whole authorisation, same as a real S3 presigned URL.
  const putResponse = await fetch(intent.put_url!, {
    method: 'PUT',
    headers: intent.put_headers ?? undefined,
    body: file,
  })
  if (!putResponse.ok) {
    throw new ApiError('Could not upload the file. Check your connection and try again.', undefined, putResponse.status)
  }

  const { data: completed, error: completeError } = await api.POST('/file-uploads/{id}/complete', {
    params: { path: { id: intent.id } },
  })
  if (completeError) throw new ApiError('Could not finish this upload.', completeError)

  if (completed.status === 'quarantined') {
    throw new ApiError('This file failed the virus check and cannot be used.', {
      error: { code: 'file_quarantined', message: 'This file failed the virus check and cannot be used.' },
    })
  }
  return completed
}

/**
 * A row whose file is still being scanned, or was quarantined, reads this instead of its usual
 * status (contract gate 7, BR §3.8) — every list of `Upload`/`StudentDocument`/`LibraryDocument`
 * shows the same two words for the same two states.
 */
export function scanStatusLabel(status: string | null | undefined): string | null {
  if (status === 'pending') return 'Checking file…'
  if (status === 'quarantined') return 'Failed virus check'
  return null
}
