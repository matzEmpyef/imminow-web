import { useState } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { usePermissionChecker } from '@/lib/permissions'
import { useCommission } from '@/queries/commission'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { formatDate } from '@/lib/time'
import { RecordPlatformPaymentModal } from './RecordPlatformPaymentModal'
import type { components } from '@/api/schema'

type CommissionDue = components['schemas']['CommissionDue']
type CommissionPayment = components['schemas']['CommissionPayment']

const inr = (m: { amount?: number | null; currency: string } | undefined) =>
  m ? `${(m.amount ?? 0).toLocaleString()} ${m.currency}` : '—'

const TABS = ['Active Cases', 'Payment History'] as const
type Tab = (typeof TABS)[number]

// Consultancy-side payment history (user decision 2026-08-28: moved off the main page onto its
// own tab). Shows which case each payment was declared against — "General" for legacy pooled
// rows that predate per-case linking.
function PaymentHistoryTab({ payments }: { payments: CommissionPayment[] }) {
  return (
    <Card>
      <h2 className="text-h3 text-text-primary">Payment History</h2>
      {payments.length === 0 && <p className="mt-sm text-body-sm text-text-secondary">No payments recorded yet.</p>}
      <div className="mt-sm flex flex-col gap-xs">
        {payments.map((payment) => (
          <div key={payment.id} className="flex flex-wrap items-center gap-sm text-body-sm">
            <span className="font-medium text-text-primary">
              {(payment.amount.amount ?? 0).toLocaleString()} {payment.amount.currency}
            </span>
            <Badge color="secondary">{payment.applicant_name ?? 'General'}</Badge>
            {payment.transaction_id && (
              <span className="text-caption text-text-secondary">txn {payment.transaction_id}</span>
            )}
            <span className="ml-auto text-text-secondary">
              declared {formatDate(payment.recorded_at)}
              {payment.confirmed_at ? ` · confirmed ${formatDate(payment.confirmed_at)}` : ''}
            </span>
            <Badge color={payment.status === 'confirmed' ? 'success' : 'secondary'}>{payment.status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function CommissionDetailsPage() {
  // Was a raw role !== 'consultancy_admin' check even though the denial copy below always
  // promised permission-based access — now it actually checks the key. usePermissionChecker
  // (not usePermission) because a denial page must not flash while permissions are loading.
  const { can, isLoading: permsLoading, isError: permsError, refetch: refetchPerms } = usePermissionChecker()
  const commission = useCommission()
  const [activeTab, setActiveTab] = useState<Tab>('Active Cases')
  const [payingDue, setPayingDue] = useState<CommissionDue | null>(null)

  if (permsLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  // A failed permission fetch is a network problem, not a denial — showing the "limited to Admin
  // and Billing permission holders" copy here would be inventing a decision nobody made.
  if (permsError) {
    return (
      <AppShell>
        <ErrorState message="Could not check your permissions." onRetry={refetchPerms} />
      </AppShell>
    )
  }

  if (!can('billing.view_commission_details')) {
    return (
      <AppShell>
        <Card>
          <p className="text-body text-text-secondary">
            Commission Details is limited to Admin and Billing permission holders.
          </p>
        </Card>
      </AppShell>
    )
  }

  if (commission.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  if (commission.isError || !commission.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load commission details." onRetry={() => commission.refetch()} />
      </AppShell>
    )
  }

  const data = commission.data
  const canRecordPayment = can('billing.record_payment')

  const dueColumns: TableColumn<CommissionDue>[] = [
    {
      key: 'applicant',
      header: 'Applicant',
      render: (due) => (
        <div>
          <span className="font-medium text-text-primary">{due.applicant_name}</span>
          <p className="text-caption text-text-secondary">
            {due.case_type === 'pr' ? 'PR case' : (due.college_name ?? '—')}
          </p>
        </div>
      ),
    },
    {
      key: 'payer',
      header: 'Payer',
      render: (due) => (
        <span className="capitalize">{due.payer_method === 'applicant' ? 'Applicant' : due.payer_method}</span>
      ),
    },
    { key: 'expected', header: 'Expected', align: 'right', render: (due) => inr(due.expected_total) },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      render: (due) => {
        const settled = (due.balance.amount ?? 0) <= 0
        return (
          <div className="flex items-center justify-end gap-sm">
            <span>{inr(due.received_total)}</span>
            {settled ? (
              <Badge color="success">Paid</Badge>
            ) : (due.received_total.amount ?? 0) > 0 ? (
              <Badge color="warning">Partial</Badge>
            ) : (
              <Badge color="secondary">Unpaid</Badge>
            )}
          </div>
        )
      },
    },
    {
      key: 'platform_due',
      header: 'Due to immiNow',
      align: 'right',
      render: (due) => (
        <div className="flex items-center justify-end gap-sm">
          <span className="font-medium">{inr(due.platform_due)}</span>
          <span className="text-caption text-text-secondary">{due.rate_percent}%</span>
          {due.rate_source === 'fallback_default' && (
            // The 10% default applied because no Commission Rates row existed for this
            // country + payer method — immiNow needs to configure one, not discover this later.
            <Badge color="warning">default rate</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'platform_payment',
      header: 'Platform payment',
      align: 'right',
      render: (due) => {
        const paid = due.platform_paid.amount ?? 0
        const awaiting = due.platform_awaiting.amount ?? 0
        if (paid === 0 && awaiting === 0) return <span className="text-text-secondary">—</span>
        return (
          <div className="flex flex-col items-end gap-2xs">
            {paid > 0 && <Badge color="success">{inr(due.platform_paid)} paid</Badge>}
            {awaiting > 0 && <Badge color="secondary">{inr(due.platform_awaiting)} awaiting</Badge>}
          </div>
        )
      },
    },
    {
      key: 'recognized',
      header: 'Accepted',
      align: 'right',
      render: (due) => formatDate(due.recognized_at),
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Commission Details</h1>
          <p className="mt-xs text-h2 text-text-primary">
            {data.running_total.toLocaleString()} {data.currency} running total
          </p>
        </div>

        {payingDue && <RecordPlatformPaymentModal due={payingDue} onClose={() => setPayingDue(null)} />}

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-md py-sm text-body-sm ${
                activeTab === tab ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Active Cases' && (
          <Card>
            <div>
              <h2 className="text-h3 text-text-primary">Active Cases</h2>
              <p className="text-caption text-text-secondary">
                One row per accepted case (or PR contribution). Mixed-currency agreements are shown INR-normalized;
                per-source detail lives on each applicant&rsquo;s Commissions tab. This page is the one place the
                platform&rsquo;s cut is visible.
                {canRecordPayment && ' Click a case to record a payment against its due.'}
              </p>
            </div>
            <div className="mt-sm">
              <Table
                columns={dueColumns}
                rows={data.dues}
                rowKey={(due) => due.id}
                emptyMessage="Nothing pending — cases appear here when a college is accepted."
                onRowClick={canRecordPayment ? (due) => setPayingDue(due) : undefined}
              />
            </div>
          </Card>
        )}

        {activeTab === 'Payment History' && <PaymentHistoryTab payments={data.payment_history} />}
      </div>
    </AppShell>
  )
}
