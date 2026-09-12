import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Modal } from '@/components/Modal'
import { TextAreaField } from '@/components/TextAreaField'
import { showToast } from '@/lib/toast'
import { useUpdateMyMfaPolicy, type MfaPolicy } from '@/queries/consultancy'
import type { components } from '@/api/schema'

type Consultancy = components['schemas']['Consultancy']

// Who at this consultancy must use two-factor authentication (build reference §1.1; user
// decision, review L15, 2026-09-12: "the consultancy admin can mandate 2FA for all consultancy
// users"). Admins always must — that is the platform floor. The admin here can extend it to every
// employee and undo their own extension; a policy immiNow raised can only be lowered by immiNow.
// Enrollment itself arrives with the real sign-in system; until then this sets the requirement
// staff see on My Account and the platform will enforce.
export function SecurityTab({ consultancy }: { consultancy: Consultancy }) {
  const everyone = consultancy.mfa_policy === 'all_staff'
  const setByPlatform = everyone && consultancy.mfa_policy_set_by === 'platform'
  const [confirming, setConfirming] = useState<MfaPolicy | null>(null)

  return (
    <Card>
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div className="flex items-start gap-md">
            <ShieldCheck className="mt-xs h-5 w-5 shrink-0 text-text-secondary" />
            <div className="flex flex-col gap-xs">
              <h2 className="text-h3 text-text-primary">Two-factor authentication</h2>
              <p className="text-body-sm text-text-secondary">
                {everyone
                  ? 'Required for everyone at this consultancy.'
                  : 'Required for admins. Optional for everyone else.'}
              </p>
              {setByPlatform && (
                <p className="text-caption text-text-secondary">
                  Set by immiNow — only immiNow can lower it. Contact support if you believe this is wrong.
                </p>
              )}
              <p className="text-caption text-text-secondary">
                Set-up for each person arrives with the new sign-in system; the requirement is recorded now and
                shown on everyone&apos;s My Account.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-sm">
            <Badge color={everyone ? 'success' : 'secondary'}>{everyone ? 'Everyone' : 'Admins only'}</Badge>
            {everyone ? (
              <Button variant="secondary" size="sm" disabled={setByPlatform} onClick={() => setConfirming('admins_only')}>
                Require for admins only
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConfirming('all_staff')}>
                Require for everyone
              </Button>
            )}
          </div>
        </div>
      </div>
      {confirming && (
        <MfaPolicyConfirmModal
          policy={confirming}
          consultancyName={consultancy.name}
          onClose={() => setConfirming(null)}
        />
      )}
    </Card>
  )
}

function MfaPolicyConfirmModal({
  policy,
  consultancyName,
  onClose,
}: {
  policy: MfaPolicy
  consultancyName: string
  onClose: () => void
}) {
  const update = useUpdateMyMfaPolicy()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const reasonError = touched && !reason.trim() ? 'A reason is required for a security change.' : undefined
  const everyone = policy === 'all_staff'

  function submit() {
    setTouched(true)
    if (!reason.trim()) return
    update.mutate(
      { mfa_policy: policy, reason: reason.trim() },
      {
        onSuccess: () => {
          showToast(
            everyone
              ? 'Two-factor authentication is now required for everyone'
              : 'Two-factor authentication is required for admins only',
          )
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={everyone ? 'Require two-factor for everyone?' : 'Require two-factor for admins only?'}
      widthRem={28}
      footer={
        <>
          {update.isError && <p className="mr-auto self-center text-body-sm text-error">{update.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={update.isPending} onClick={submit}>
            {everyone ? 'Require for everyone' : 'Admins only'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-primary">
          {everyone
            ? `Every user at ${consultancyName} will have to use two-factor authentication once sign-in set-up is live. Everyone is told now.`
            : `Only admins at ${consultancyName} will have to use two-factor authentication. Everyone is told now.`}
        </p>
        <TextAreaField
          label="Reason"
          required
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          error={reasonError}
          placeholder="Recorded in the audit log"
        />
      </div>
    </Modal>
  )
}
