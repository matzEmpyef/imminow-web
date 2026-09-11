import { useMemo, useState } from 'react'
import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import {
  useFreelancerRates,
  useCreateFreelancerRate,
  useUpdateFreelancerRate,
  useResendFreelancerInvite,
  useUpdateFreelancer,
  type Freelancer,
} from '@/queries/freelancerRates'
import { useFreelancerReferralsAdmin } from '@/queries/freelancerReferrals'
import { formatDate } from '@/lib/time'
import { ChangeReferralCodeModal } from './ChangeReferralCodeModal'
import { DeactivateFreelancerModal } from './DeactivateFreelancerModal'

const STATUS_BADGE = {
  invited: { color: 'warning', label: 'Invited' },
  active: { color: 'success', label: 'Active' },
  deactivated: { color: 'secondary', label: 'Deactivated' },
} as const

const PAYOUT_STATUS_BADGE = {
  not_due: { color: 'secondary', label: 'Not due' },
  owed: { color: 'warning', label: 'Owed' },
  paid: { color: 'success', label: 'Paid' },
} as const

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

/** The share editor — a plain % field that either creates or updates the FreelancerRate row (there is at most one per freelancer), depending on whether Freelancer.rate is null. */
function ShareEditor({ freelancer }: { freelancer: Freelancer }) {
  const rates = useFreelancerRates()
  const createRate = useCreateFreelancerRate()
  const updateRate = useUpdateFreelancerRate(
    rates.data?.find((r) => r.freelancer_id === freelancer.id)?.id ?? '',
  )
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(freelancer.rate ?? 0)

  const existingRateId = rates.data?.find((r) => r.freelancer_id === freelancer.id)?.id
  const saving = createRate.isPending || updateRate.isPending
  const saveError = createRate.error?.message ?? updateRate.error?.message

  function handleSave() {
    if (existingRateId) {
      updateRate.mutate(value, { onSuccess: () => setEditing(false) })
    } else {
      createRate.mutate({ freelancer_id: freelancer.id, rate: value }, { onSuccess: () => setEditing(false) })
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-md rounded-md bg-background px-md py-sm">
        <div>
          <p className="text-caption text-text-secondary">Share of collected commission</p>
          {freelancer.rate != null ? (
            <p className="text-body font-medium text-text-primary">{freelancer.rate}%</p>
          ) : (
            <Badge color="warning">Not set</Badge>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setValue(freelancer.rate ?? 0)
            setEditing(true)
          }}
        >
          Edit share
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-sm rounded-md border border-border px-md py-sm">
      <div className="flex items-end gap-sm">
        <TextField
          label="Share %"
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="flex-1"
        />
        <Button size="sm" loading={saving} onClick={handleSave}>
          Save
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {saveError && <p className="text-caption text-error">{saveError}</p>}
      <p className="text-caption text-text-secondary">
        Their share of the commission immiNow collects on the students they bring.
      </p>
    </div>
  )
}

/**
 * A freelancer's own detail view (2026-09-11 rebuild) — everything specific to one account that
 * doesn't belong on the roster row: the share editor, changing the referral code, resending an
 * invite, activation, and their own compact referral list with payout status.
 */
export function FreelancerDrawer({ freelancer, onClose }: { freelancer: Freelancer | null; onClose: () => void }) {
  const [changingCode, setChangingCode] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const resendInvite = useResendFreelancerInvite()
  const updateFreelancer = useUpdateFreelancer()
  const [resent, setResent] = useState(false)

  const referrals = useFreelancerReferralsAdmin(
    { freelancer_id: freelancer?.id, limit: 20 },
    { enabled: Boolean(freelancer) },
  )
  const rows = useMemo(() => referrals.data?.items ?? [], [referrals.data])

  return (
    <Drawer open={freelancer != null} onClose={onClose} title={freelancer?.name ?? 'Freelancer'}>
      {freelancer && (
        <div className="flex flex-col gap-lg">
          <div className="flex items-center gap-sm">
            <Badge color={STATUS_BADGE[freelancer.status ?? 'active'].color}>
              {STATUS_BADGE[freelancer.status ?? 'active'].label}
            </Badge>
            <span className="text-body-sm text-text-secondary">{freelancer.email}</span>
          </div>

          <div className="grid grid-cols-2 gap-sm text-body-sm">
            <div>
              <p className="text-caption text-text-secondary">Referrals</p>
              <p className="text-text-primary">{freelancer.referrals ?? 0}</p>
            </div>
            <div>
              <p className="text-caption text-text-secondary">Owed now</p>
              <p className={freelancer.owed_inr ? 'font-medium text-warning' : 'text-text-primary'}>
                {inr(freelancer.owed_inr)}
              </p>
            </div>
            <div>
              <p className="text-caption text-text-secondary">Earned</p>
              <p className="text-text-primary">{inr(freelancer.earned_inr)}</p>
            </div>
            <div>
              <p className="text-caption text-text-secondary">Paid so far</p>
              <p className="text-text-primary">{inr(freelancer.paid_inr)}</p>
            </div>
          </div>

          <ShareEditor freelancer={freelancer} />

          <div className="flex items-center justify-between gap-md rounded-md bg-background px-md py-sm">
            <div>
              <p className="text-caption text-text-secondary">Referral code</p>
              <p className="font-mono text-body font-medium text-text-primary">{freelancer.referral_code}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setChangingCode(true)}>
              Change code
            </Button>
          </div>

          <div className="flex flex-wrap gap-sm">
            {freelancer.status === 'invited' && (
              <Button
                variant="secondary"
                size="sm"
                loading={resendInvite.isPending}
                onClick={() =>
                  resendInvite.mutate(freelancer.id, {
                    onSuccess: () => {
                      setResent(true)
                      setTimeout(() => setResent(false), 3000)
                    },
                  })
                }
              >
                {resent ? 'Invite resent' : 'Resend invite'}
              </Button>
            )}
            {freelancer.active !== false ? (
              <Button variant="destructive" size="sm" onClick={() => setDeactivating(true)}>
                Deactivate
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                loading={updateFreelancer.isPending}
                onClick={() => updateFreelancer.mutate({ id: freelancer.id, active: true })}
              >
                Reactivate
              </Button>
            )}
          </div>
          {resendInvite.isError && <p className="text-caption text-error">{resendInvite.error.message}</p>}

          <div>
            <h3 className="text-body-sm font-medium text-text-primary">Referrals</h3>
            <div className="mt-xs flex flex-col gap-xs">
              {referrals.isLoading && <p className="text-caption text-text-secondary">Loading…</p>}
              {referrals.isError && <p className="text-caption text-error">Could not load referrals.</p>}
              {!referrals.isLoading && !referrals.isError && rows.length === 0 && (
                <p className="text-caption text-text-secondary">No referrals yet.</p>
              )}
              {rows.map((r) => (
                <div key={r.id} className="rounded-md border border-border px-sm py-xs">
                  <div className="flex items-center justify-between gap-sm">
                    <span className="text-body-sm font-medium text-text-primary">{r.applicant_name}</span>
                    <Badge color={PAYOUT_STATUS_BADGE[r.payout_status ?? 'not_due'].color}>
                      {PAYOUT_STATUS_BADGE[r.payout_status ?? 'not_due'].label}
                    </Badge>
                  </div>
                  <p className="text-caption text-text-secondary">
                    Referred {formatDate(r.created_at)} · Earned {inr(r.earned_inr)} · Owed {inr(r.owed_inr)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {changingCode && freelancer && (
        <ChangeReferralCodeModal freelancer={freelancer} onClose={() => setChangingCode(false)} />
      )}
      {deactivating && freelancer && (
        <DeactivateFreelancerModal freelancer={freelancer} onClose={() => setDeactivating(false)} />
      )}
    </Drawer>
  )
}
