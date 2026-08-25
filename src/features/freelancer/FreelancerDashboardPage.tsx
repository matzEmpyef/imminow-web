import { useState } from 'react'
import { FreelancerShell } from '@/features/auth/FreelancerShell'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { useFreelancerMe, useFreelancerReferrals } from '@/queries/freelancerReferrals'
import { Skeleton } from '@/components/QueryState'
import { formatDate } from '@/lib/time'

/**
 * "Your referral link" card (2026-08-19 — "freelancer should be able to share referral code as
 * url to download"). A student signing up through this link lands in Awaiting Match and appears
 * in the list below automatically; commission stays governed by the Commission Table (build
 * reference 1.17) — the link changes how referrals arrive, not what they pay.
 */
function ReferralLinkCard() {
  const me = useFreelancerMe()
  const [copied, setCopied] = useState<'code' | 'url' | null>(null)

  if (!me.data) return null
  const copy = async (value: string, which: 'code' | 'url') => {
    await navigator.clipboard.writeText(value)
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <Card>
      <div className="flex flex-col gap-sm">
        <div>
          <p className="text-body font-medium text-text-primary">Your referral link</p>
          <p className="text-caption text-text-secondary">
            Share it anywhere — a student who signs up through it is tracked to you automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-sm">
          <code className="rounded-md border border-border bg-background px-md py-xs text-body font-medium tracking-widest text-text-primary">
            {me.data.referral_code}
          </code>
          <Button variant="secondary" onClick={() => copy(me.data.referral_code, 'code')}>
            {copied === 'code' ? 'Copied!' : 'Copy code'}
          </Button>
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-md py-xs text-body-sm text-text-secondary">
            {me.data.share_url}
          </code>
          <Button variant="secondary" onClick={() => copy(me.data.share_url, 'url')}>
            {copied === 'url' ? 'Copied!' : 'Copy link'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function FreelancerDashboardPage() {
  const referrals = useFreelancerReferrals()
  const items = referrals.data ?? []
  const owedCount = items.filter((r) => r.payment_status === 'owed').length
  const paidCount = items.filter((r) => r.payment_status === 'paid').length

  return (
    <FreelancerShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Freelancer Dashboard</h1>
          <p className="text-body-sm text-text-secondary">
            Aspirants you've referred, with their current status and payment status. Tracking only — you don't manage
            their case or chat with them here.
          </p>
        </div>

        <ReferralLinkCard />

        <div className="flex gap-md">
          <Card className="w-fit">
            <p className="text-caption text-text-secondary">Referred</p>
            <p className="text-h2 text-text-primary">{items.length}</p>
          </Card>
          <Card className="w-fit">
            <p className="text-caption text-text-secondary">Owed</p>
            <p className="text-h2 text-warning">{owedCount}</p>
          </Card>
          <Card className="w-fit">
            <p className="text-caption text-text-secondary">Paid</p>
            <p className="text-h2 text-success">{paidCount}</p>
          </Card>
        </div>

        {referrals.isLoading && <Skeleton className="h-40 rounded-lg" />}

        {referrals.isError && (
          <Card>
            <p className="text-body text-error">{referrals.error.message}</p>
          </Card>
        )}

        <div className="flex flex-col gap-sm">
          {items.map((referral) => (
            <Card key={referral.id}>
              <div className="flex items-center gap-md">
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-text-primary">{referral.applicant_name}</p>
                  <p className="text-caption text-text-secondary">Referred {formatDate(referral.created_at)}</p>
                </div>
                <Badge color="info" className="capitalize">
                  {referral.status.replace(/_/g, ' ')}
                </Badge>
                <Badge color={referral.payment_status === 'paid' ? 'success' : 'warning'} className="capitalize">
                  {referral.payment_status}
                </Badge>
              </div>
            </Card>
          ))}
          {!referrals.isLoading && items.length === 0 && (
            <Card>
              <p className="text-body text-text-secondary">No referrals yet.</p>
            </Card>
          )}
        </div>
      </div>
    </FreelancerShell>
  )
}
