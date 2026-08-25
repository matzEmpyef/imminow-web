import { useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Table, type TableColumn } from '@/components/Table'
import { useAllFreelancerReferrals, useMarkReferralPayment } from '@/queries/freelancerReferrals'
import { formatDate } from '@/lib/time'

type Row = NonNullable<ReturnType<typeof useAllFreelancerReferrals>['data']>[number]

/**
 * Freelancer Payouts (2026-08-19) — closes the loop the referral flow opened: `payment_status`
 * was set to `owed` at signup and read on the freelancer's own dashboard, but nothing could flip
 * it to `paid`. Money moves outside the platform (build reference 1.19, tracking only); this
 * records that it did, audit-logged server-side.
 */
export function FreelancerPayoutsPage() {
  const referrals = useAllFreelancerReferrals()
  const markPayment = useMarkReferralPayment()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const rows = referrals.data ?? []
  const owedCount = rows.filter((r) => r.payment_status === 'owed').length

  const setStatus = (row: Row, payment_status: 'owed' | 'paid') => {
    setPendingId(row.id)
    markPayment.mutate({ id: row.id, payment_status }, { onSettled: () => setPendingId(null) })
  }

  const columns: TableColumn<Row>[] = [
    {
      key: 'freelancer',
      header: 'Freelancer',
      render: (r) => <span className="font-medium text-text-primary">{r.freelancer_name}</span>,
    },
    { key: 'applicant', header: 'Applicant', render: (r) => r.applicant_name },
    {
      key: 'status',
      header: 'Case status',
      render: (r) => (
        <Badge color="info" className="capitalize">
          {r.status.replace(/_/g, ' ')}
        </Badge>
      ),
      hideBelow: 'md',
    },
    { key: 'referred', header: 'Referred', render: (r) => formatDate(r.created_at), hideBelow: 'md' },
    {
      key: 'payment',
      header: 'Payment',
      render: (r) => (
        <Badge color={r.payment_status === 'paid' ? 'success' : 'warning'} className="capitalize">
          {r.payment_status}
        </Badge>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (r) =>
        r.payment_status === 'owed' ? (
          <Button
            variant="secondary"
            loading={pendingId === r.id && markPayment.isPending}
            onClick={() => setStatus(r, 'paid')}
          >
            Mark paid
          </Button>
        ) : (
          // Reversible on purpose: a mis-click on "Mark paid" must not require a database
          // engineer to undo — the audit log keeps the full trail either way.
          <Button
            variant="secondary"
            loading={pendingId === r.id && markPayment.isPending}
            onClick={() => setStatus(r, 'owed')}
          >
            Revert to owed
          </Button>
        ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Freelancer Payouts</h1>
          <p className="text-body-sm text-text-secondary">
            Every freelancer referral platform-wide. Marking a row paid records that the payout happened — the money
            itself moves outside the platform. {owedCount} currently owed.
          </p>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={referrals.isLoading}
          emptyMessage="No freelancer referrals yet."
        />

        {referrals.isError && <p className="text-body text-error">{referrals.error.message}</p>}
        {markPayment.isError && <p className="text-body text-error">{markPayment.error.message}</p>}
      </div>
    </AdminShell>
  )
}
