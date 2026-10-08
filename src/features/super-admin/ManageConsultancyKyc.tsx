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
 * reason, the consultancy is shown it and submits again. A verified certificate cannot be
 * rejected (409), so Reject is offered for a pending one only; a rejected one can still be
 * verified, which is the reviewer changing their mind about the same document.
 */
export function KycSection({ consultancyId, kycVerified }: { consultancyId: string; kycVerified: boolean }) {
  const kyc = useConsultancyKyc(consultancyId)
  const verify = useVerifyKyc()
  const reject = useRejectKyc()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const status: KycState = kyc.data?.status ?? (kycVerified ? 'verified' : 'not_submitted')
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
            <p className="text-caption text-text-secondary">No certificate submitted yet.</p>
          )}
          {verify.isError && <p className="text-caption text-error">{verify.error.message}</p>}
        </div>
        {!rejecting && (status === 'pending' || status === 'rejected') && (
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
            {status === 'pending' && (
              <Button variant="secondary" disabled={verify.isPending} onClick={() => setRejecting(true)}>
                Reject
              </Button>
            )}
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
