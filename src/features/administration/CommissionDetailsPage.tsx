import { useState, type FormEvent } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Table, type TableColumn } from '@/components/Table'
import { usePermissionChecker } from '@/lib/permissions'
import { useCommission, useRecordCommissionPayment } from '@/queries/commission'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type CommissionDue = components['schemas']['CommissionDue']

const inr = (m: { amount?: number | null; currency: string } | undefined) =>
  m ? `${(m.amount ?? 0).toLocaleString()} ${m.currency}` : '—'

function RecordPaymentForm() {
  const recordPayment = useRecordCommissionPayment()
  const [amount, setAmount] = useState('')
  const [proofUrl, setProofUrl] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!amount) return
    recordPayment.mutate(
      { amount: Number(amount), proof_url: proofUrl || null },
      {
        onSuccess: () => {
          setAmount('')
          setProofUrl('')
        },
      },
    )
  }

  return (
    <Card>
      <h2 className="text-h3 text-text-primary">Record a Payment</h2>
      <form onSubmit={handleSubmit} className="mt-md flex flex-col gap-md">
        <div className="grid grid-cols-2 gap-md">
          <TextField label="Amount (INR)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <TextField
            label="Proof URL"
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
            placeholder="Link to payment receipt/screenshot"
          />
        </div>
        {recordPayment.isSuccess && (
          <p className="text-body-sm text-success">
            Recorded — Sentpo finance has been notified. A receipt attaches once confirmed.
          </p>
        )}
        {recordPayment.isError && <p className="text-body-sm text-error">{recordPayment.error.message}</p>}
        <Button type="submit" loading={recordPayment.isPending} disabled={!amount} className="w-fit self-end mt-4">
          Declare Payment
        </Button>
      </form>
    </Card>
  )
}

export function CommissionDetailsPage() {
  // Was a raw role !== 'consultancy_admin' check even though the denial copy below always
  // promised permission-based access — now it actually checks the key. usePermissionChecker
  // (not usePermission) because a denial page must not flash while permissions are loading.
  const { can, isLoading: permsLoading, isError: permsError, refetch: refetchPerms } = usePermissionChecker()
  const commission = useCommission()

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
      header: 'Due to Sentpo',
      align: 'right',
      render: (due) => (
        <div className="flex items-center justify-end gap-sm">
          <span className="font-medium">{inr(due.platform_due)}</span>
          <span className="text-caption text-text-secondary">{due.rate_percent}%</span>
          {due.rate_source === 'fallback_default' && (
            // The 10% default applied because no Commission Rates row existed for this
            // country + payer method — Sentpo needs to configure one, not discover this later.
            <Badge color="warning">default rate</Badge>
          )}
        </div>
      ),
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

        <Card>
          <div>
            <h2 className="text-h3 text-text-primary">Active Cases</h2>
            <p className="text-caption text-text-secondary">
              One row per accepted case (or PR contribution). Mixed-currency agreements are shown INR-normalized;
              per-source detail lives on each applicant&rsquo;s Commissions tab. This page is the one place the
              platform&rsquo;s cut is visible.
            </p>
          </div>
          <div className="mt-sm">
            <Table
              columns={dueColumns}
              rows={data.dues}
              rowKey={(due) => due.id}
              emptyMessage="Nothing pending — cases appear here when a college is accepted."
            />
          </div>
        </Card>

        {canRecordPayment && <RecordPaymentForm />}

        <Card>
          <h2 className="text-h3 text-text-primary">Payment History</h2>
          {data.payment_history.length === 0 && (
            <p className="mt-sm text-body-sm text-text-secondary">No payments recorded yet.</p>
          )}
          <div className="mt-sm flex flex-col gap-xs">
            {data.payment_history.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between text-body-sm">
                <span className="text-text-primary">
                  {(payment.amount.amount ?? 0).toLocaleString()} {payment.amount.currency}
                </span>
                <span className="text-text-secondary">{formatDate(payment.recorded_at)}</span>
                <Badge color={payment.status === 'confirmed' ? 'success' : 'secondary'}>{payment.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
