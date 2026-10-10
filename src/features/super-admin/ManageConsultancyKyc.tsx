import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { KycDocument } from '@/components/KycDocument'
import { TextAreaField } from '@/components/TextAreaField'
import { useConsultancyKyc, useRejectKyc, useVerifyKyc } from '@/queries/kyc'
import { formatDate } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { KYC_BADGE, type KycState } from './kycBadge'

// The contract's own limit on a rejection reason.
const REASON_MAX = 500

/**
 * KYC review inside Manage (2026-08-19) — the other half of the consultancy's certificate
 * upload. Verify is enabled only when a document exists (the server 400s otherwise too — a
 * badge is never granted sight unseen), and the submitted certificate opens in a new tab for
 * actual review before approving.
 *
 * Reject (review I-010) sits beside Verify while a certificate is waiting: the reviewer gives a
 * reason, the consultancy is shown it and submits again. Both are offered for a PENDING
 * certificate only. A verified one cannot be rejected (409 `already_reviewed`), and a rejected one
 * is its own state (review 2.115): the contract does not allow verifying it, so Verify is not
 * offered; the consultancy submits a new certificate, which reads pending and is reviewed again.
 */
export function KycSection({ consultancyId, kycVerified }: { consultancyId: string; kycVerified: boolean }) {
  const kyc = useConsultancyKyc(consultancyId)
  const verify = useVerifyKyc()
  const reject = useRejectKyc()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  // An account verified offline has no certificate on record: the list reads it as verified
  // (`Consultancy.kyc_status`), so this row must too, not "No certificate".
  const served = kyc.data?.status
  const verifiedOffline = kycVerified && (served === undefined || served === 'not_submitted')
  const status: KycState = verifiedOffline ? 'verified' : (served ?? 'not_submitted')
  const badge = KYC_BADGE[status]
  const uploadedAt = kyc.data?.uploaded_at

  function closeReject() {
    setRejecting(false)
    setReason('')
    reject.reset()
  }

  return (
    <div className="flex flex-col gap-sm p-md">
      <div className="flex items-center justify-between gap-md">
        <div className="min-w-0">
          <p className="flex items-center gap-sm text-body-sm font-medium text-text-primary">
            KYC
            <Badge color={badge.color}>{badge.label}</Badge>
          </p>
          {status === 'rejected' && (
            <p className="mt-xs text-caption text-text-secondary">
              Rejected{kyc.data?.rejected_at ? ` on ${formatDate(kyc.data.rejected_at)}` : ''}
              {kyc.data?.rejected_reason ? `: ${kyc.data.rejected_reason}` : ''}
            </p>
          )}
          {kyc.data?.document_url ? (
            <div className="mt-xs">
              <KycDocument kyc={kyc.data} label="certificate" size="sm" />
            </div>
          ) : (
            <p className="text-caption text-text-secondary">
              {verifiedOffline ? 'Verified without a certificate on file.' : 'No certificate submitted yet.'}
            </p>
          )}
          {status === 'rejected' && (
            <p className="mt-xs text-caption text-text-secondary">Waiting for the consultancy to submit a new certificate.</p>
          )}
          {verify.isError && <p className="text-caption text-error">{verify.error.message}</p>}
        </div>
        {!rejecting && status === 'pending' && (
          <div className="flex shrink-0 gap-sm">
            {/* Verify names the certificate on screen by its upload time (review F-207), so it is
                offered once that certificate has been served. */}
            <Button
              variant="secondary"
              loading={verify.isPending}
              disabled={!uploadedAt}
              onClick={() => uploadedAt && verify.mutate({ consultancyId, uploadedAt })}
            >
              Verify
            </Button>
            <Button variant="secondary" disabled={verify.isPending} onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        )}
      </div>
      {rejecting && (
        <div className="flex flex-col gap-sm">
          <TextAreaField
            label="Reason for rejecting"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX}
            hint="The consultancy is shown this reason and asked to submit a new certificate."
            // The server's own sentence — e.g. the certificate was verified in the meantime.
            error={reject.isError ? reject.error.message : undefined}
          />
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={closeReject} disabled={reject.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={reject.isPending}
              disabled={!reason.trim()}
              onClick={() =>
                reject.mutate(
                  { consultancyId, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      showToast('Certificate rejected — the consultancy has been told')
                      closeReject()
                    },
                  },
                )
              }
            >
              Reject certificate
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
