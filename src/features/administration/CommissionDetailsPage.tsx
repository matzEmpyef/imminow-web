import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { StopPropagation } from '@/components/StopPropagation'
import { usePermissionChecker } from '@/lib/permissions'
import { useCommission } from '@/queries/commission'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { formatDate } from '@/lib/time'
import { formatApprox, formatMoney, formatMoneyAmount } from '@/lib/money'
import { RecordPlatformPaymentModal } from './RecordPlatformPaymentModal'
import { DueScheduleDrawer } from './commission/DueScheduleDrawer'
import type { components } from '@/api/schema'

type CommissionDue = components['schemas']['CommissionDue']
type CommissionPayment = components['schemas']['CommissionPayment']
type Money = components['schemas']['Money']

const inr = formatMoneyAmount

// overdue_inr/next_due_on are plain INR numbers on CommissionDue, not Money — formatMoneyAmount
// doesn't apply to them (2026-09-11).
function inrNum(n: number | null | undefined): string {
  return n == null ? '—' : `₹${n.toLocaleString('en-IN')}`
}

// Held in INR — mixed-currency agreements are summed through it, and immiNow collects its cut in
// it — with the consultancy's own currency beneath when that differs (2026-09-10, user: "show the
// currency in which it is collected and then give approx conversion").
function InrAmount({ money }: { money: Money }) {
  const approx = formatApprox(money.approx)
  return (
    <span className="inline-flex flex-col items-end">
      <span>{formatMoneyAmount(money)}</span>
      {approx && <span className="text-caption font-normal text-text-secondary">{approx}</span>}
    </span>
  )
}

const TABS = ['Active Cases', 'Payment History'] as const
type Tab = (typeof TABS)[number]

// Consultancy-side payment history (user decision 2026-08-28: moved off the main page onto its
// own tab). Shows which case each payment was declared against — "General" for legacy pooled
// rows that predate per-case linking.
function PaymentHistoryTab({ payments }: { payments: CommissionPayment[] }) {
  // A proper table (user, 2026-08-28) — columns beat a flowing row the moment there are more
  // than a few payments to scan.
  const columns: TableColumn<CommissionPayment>[] = [
    {
      key: 'amount',
      header: 'Amount',
      render: (p) => {
        const corrections = p.corrections ?? []
        const correctionsTitle = corrections
          .map((c) => `${inrNum(c.from_amount)} → ${inrNum(c.to_amount)}: ${c.reason ?? ''}`)
          .join('\n')
        return (
          <div className="flex flex-col">
            <span className="flex items-center gap-xs font-medium text-text-primary">
              {formatMoneyAmount(p.amount)}
              {corrections.length > 0 && (
                <span title={correctionsTitle}>
                  <Badge color="info">Corrected</Badge>
                </span>
              )}
              {/* Recorded directly by immiNow Finance, no declaration made here (2026-09-11). */}
              {p.recorded_by_finance && <Badge color="secondary">Recorded by immiNow</Badge>}
            </span>
            {/* declared_amount is only ever set when it differs from what arrived (2026-09-11). */}
            {p.declared_amount && (
              <span className="text-caption text-text-secondary">Declared {formatMoneyAmount(p.declared_amount)}</span>
            )}
            {p.received_note && <span className="text-caption text-text-secondary">{p.received_note}</span>}
          </div>
        )
      },
    },
    {
      key: 'case',
      header: 'Case',
      render: (p) =>
        p.journey_id ? (
          <Link to={`/clients/${p.journey_id}`} className="text-text-primary hover:text-primary hover:underline">
            {p.applicant_name ?? 'General'}
          </Link>
        ) : (
          'General'
        ),
    },
    {
      key: 'transaction',
      header: 'Transaction ID',
      render: (p) => (p.transaction_id ? <span className="text-text-secondary">{p.transaction_id}</span> : '—'),
    },
    { key: 'declared', header: 'Declared', align: 'right', render: (p) => formatDate(p.recorded_at) },
    {
      key: 'confirmed',
      header: 'Confirmed',
      align: 'right',
      render: (p) => (p.confirmed_at ? formatDate(p.confirmed_at) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (p) => (
        <Badge
          color={p.status === 'confirmed' ? 'success' : p.status === 'rejected' ? 'error' : 'secondary'}
          // immiNow can turn a declaration down (2026-09-11); the reason is what they were told.
          title={p.status === 'rejected' && p.reject_reason ? `Not confirmed: ${p.reject_reason}` : undefined}
        >
          {p.status === 'confirmed' ? 'Confirmed' : p.status === 'rejected' ? 'Not confirmed' : 'Declared'}
        </Badge>
      ),
    },
  ]
  return (
    <Card>
      <h2 className="text-h3 text-text-primary">Payment History</h2>
      <div className="mt-sm">
        <Table columns={columns} rows={payments} rowKey={(p) => p.id} emptyMessage="No payments recorded yet." />
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
  const [viewingSchedule, setViewingSchedule] = useState<CommissionDue | null>(null)

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
          <StopPropagation className="inline-block">
            <Link
              to={`/clients/${due.journey_id}`}
              className="font-medium text-text-primary hover:text-primary hover:underline"
            >
              {due.applicant_name}
            </Link>
          </StopPropagation>
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
    { key: 'expected', header: 'Expected', align: 'right', render: (due) => <InrAmount money={due.expected_total} /> },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      render: (due) => {
        const settled = (due.balance.amount ?? 0) <= 0
        return (
          <div className="flex items-center justify-end gap-sm">
            <InrAmount money={due.received_total} />
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
      render: (due) => {
        const others = (due.by_currency ?? []).filter((c) => c.currency && c.currency !== 'INR' && (c.outstanding ?? 0) > 0)
        return (
          <div className="flex flex-col items-end gap-2xs">
            <div className="flex items-center gap-sm">
              <span className="font-medium">
                <InrAmount money={due.platform_outstanding ?? due.platform_due} />
              </span>
              <span className="text-caption text-text-secondary">{due.rate_percent}%</span>
              {due.rate_source === 'fallback_default' && (
                // The 10% default applied because no Commission Rates row existed for this
                // country + payer method — immiNow needs to configure one, not discover this later.
                <Badge color="warning">default rate</Badge>
              )}
            </div>
            {others.length > 0 && (
              <span className="text-caption text-text-secondary">
                {others.map((c) => `${c.currency} ${(c.outstanding ?? 0).toLocaleString('en-US')}`).join(' · ')}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'platform_expected',
      header: 'Not yet due',
      align: 'right',
      render: (due) => <InrAmount money={due.platform_expected ?? { amount: 0, currency: 'INR' }} />,
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
      key: 'schedule',
      header: 'Due schedule',
      align: 'right',
      render: (due) => {
        const overdue = due.overdue_inr ?? 0
        return (
          <StopPropagation>
            <div className="flex flex-col items-end gap-2xs">
              {overdue > 0 && <Badge color="warning">Overdue {inrNum(overdue)}</Badge>}
              {due.next_due_on && <span className="text-caption text-text-secondary">Next due {formatDate(due.next_due_on)}</span>}
              <button
                type="button"
                onClick={() => setViewingSchedule(due)}
                className="text-caption text-primary hover:underline"
              >
                View schedule
              </button>
            </div>
          </StopPropagation>
        )
      },
    },
    {
      key: 'accepted',
      header: 'Accepted',
      align: 'right',
      render: (due) => (
        <div className="flex flex-col items-end">
          <span>{due.accepted_at ? formatDate(due.accepted_at) : '—'}</span>
          <span className="text-caption text-text-secondary">
            {due.case_closed ? `Closed ${formatDate(due.recognized_at)}` : 'Open'}
          </span>
        </div>
      ),
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Commission Details</h1>
          <p className="mt-xs text-h2 text-text-primary">
            {formatMoney(data.currency, data.running_total)} running total
          </p>
          {formatApprox(data.running_total_approx) && (
            <p className="text-body-sm text-text-secondary">{formatApprox(data.running_total_approx)}</p>
          )}
        </div>

        {payingDue && <RecordPlatformPaymentModal due={payingDue} onClose={() => setPayingDue(null)} />}
        <DueScheduleDrawer due={viewingSchedule} onClose={() => setViewingSchedule(null)} />

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
                One row per accepted case (or PR contribution). Amounts are held in INR, with your own currency
                beneath where it differs (approximate — rates are set by hand); per-source detail, in the currency
                each was agreed in, lives on each applicant&rsquo;s Commissions tab. This page is the one place the
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
