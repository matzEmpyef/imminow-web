import { useRef, useState, type ChangeEvent } from 'react'
import { Card } from '@/components/Card'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { KycDocument } from '@/components/KycDocument'
import { KYC_FILE_TYPES, kycFileProblem, useMyKyc, useSubmitKyc } from '@/queries/kyc'
import { useAccountWords } from '@/lib/accountWords'
import { showToast } from '@/lib/toast'
import { formatDate } from '@/lib/time'

/**
 * KYC certificate card (2026-08-19 — "option for consultancy to upload their certificate").
 * The student app's Verified badge is earned here: upload → Platform Admin reviews in Manage
 * Consultancies → badge flips. Re-uploading a certificate resets verification server-side, so
 * the pending state after a re-submit is honest, not a bug.
 *
 * The file is a PDF or an image and goes to PRIVATE storage (review F-066): it is picked here and
 * sent by `useSubmitKyc` in three steps, never through the public image uploader the logo and the
 * gallery use. Nothing is uploaded until the button is pressed.
 */
export function KycCard() {
  const kyc = useMyKyc()
  const submitKyc = useSubmitKyc()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  // "KYC" is a consultancy's word (console review M12, 2026-09-13). A university does not do
  // Know-Your-Customer against itself — it holds an ACCREDITATION, and the thing it is being
  // asked for has a different name. Same endpoint, same review queue, same Verified badge; only
  // the wording changes, and only for an institute.
  const { isInstitute } = useAccountWords()

  // T6 (third-pass review): loading and error used to default to 'not_submitted', showing a
  // VERIFIED consultancy the "upload your certificate" pitch — and a re-upload from there
  // genuinely resets verification (see the doc comment above). Neither state may claim a status
  // nobody has fetched yet.
  if (kyc.isLoading) {
    return (
      <Card>
        <Skeleton className="h-24 rounded-lg" />
      </Card>
    )
  }
  if (kyc.isError) {
    return (
      <Card>
        <ErrorState message="Could not load your KYC status." onRetry={() => kyc.refetch()} error={kyc.error} />
      </Card>
    )
  }

  const status = kyc.data?.status ?? 'not_submitted'
  const noun = isInstitute ? 'document' : 'certificate'
  const fieldLabel = isInstitute
    ? status === 'not_submitted'
      ? 'Accreditation document'
      : 'Replace document'
    : status === 'not_submitted'
      ? 'Certificate'
      : 'Replace certificate'

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    // Cleared so picking the same file again after a refusal still fires a change.
    e.target.value = ''
    if (!picked) return
    const problem = kycFileProblem(picked)
    setFileError(problem)
    setFile(problem ? null : picked)
    submitKyc.reset()
  }

  return (
    <Card>
      <div className="flex items-center gap-sm">
        <h2 className="text-h2 text-text-primary">{isInstitute ? 'Verification' : 'KYC Verification'}</h2>
        <Badge
          color={
            status === 'verified' ? 'success' : status === 'pending' ? 'warning' : status === 'rejected' ? 'error' : 'secondary'
          }
          className="capitalize"
        >
          {status.replace(/_/g, ' ')}
        </Badge>
      </div>
      <p className="mt-xs text-body-sm text-text-secondary">
        {status === 'verified'
          ? `Your ${noun} is verified — students see the Verified badge on your profile.`
          : status === 'pending'
            ? `Your ${noun} is with the Platform Admin for review.`
            : status === 'rejected'
              ? // The reviewer's own reason (review I-010). The upload control below is how a new
                // one is sent; submitting it puts the card back to pending.
                `Your ${noun} was not accepted${kyc.data?.rejected_reason ? `: ${kyc.data.rejected_reason}` : '.'}`
              : isInstitute
                ? 'Send us your accreditation or registration document so students see the Verified badge.'
                : 'Upload your registration certificate to earn the Verified badge students see.'}
      </p>
      {status === 'rejected' && (
        <p className="mt-xs text-body-sm text-text-secondary">
          {kyc.data?.rejected_at ? `Reviewed on ${formatDate(kyc.data.rejected_at)}. ` : ''}Upload a new {noun} below to
          have it reviewed again.
        </p>
      )}
      <div className="mt-md flex flex-col gap-md">
        <KycDocument kyc={kyc.data} label={noun} />
        <div className="flex flex-col gap-xs">
          <span className="text-body-sm font-medium text-text-primary">{fieldLabel}</span>
          <div className="flex flex-wrap items-center gap-md">
            <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              {file ? 'Choose another file' : 'Choose file'}
            </Button>
            <span className="min-w-0 truncate text-body-sm text-text-secondary">
              {file ? file.name : 'No file chosen'}
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            aria-label={fieldLabel}
            accept={KYC_FILE_TYPES.join(',')}
            onChange={handleFileChange}
            className="hidden"
          />
          {fileError ? (
            <span role="alert" className="text-caption text-error">
              {fileError}
            </span>
          ) : (
            <span className="text-caption text-text-secondary">
              {isInstitute
                ? 'A PDF or an image of your accreditation or registration document, up to 10 MB.'
                : 'A PDF or an image of your registration/incorporation certificate, up to 10 MB.'}{' '}
              It is kept private. Re-uploading restarts verification.
            </span>
          )}
        </div>
        {submitKyc.isError && (
          <p role="alert" className="text-body-sm text-error">
            {submitKyc.error.message}
          </p>
        )}
        <Button
          className="w-fit"
          loading={submitKyc.isPending}
          disabled={!file}
          onClick={() =>
            file &&
            submitKyc.mutate(file, {
              onSuccess: () => {
                setFile(null)
                showToast('KYC submitted — pending verification')
              },
            })
          }
        >
          {isInstitute ? 'Upload accreditation document' : 'Submit for verification'}
        </Button>
      </div>
    </Card>
  )
}
