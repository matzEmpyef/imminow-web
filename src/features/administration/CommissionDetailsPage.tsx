import { useState, type FormEvent } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { usePermissionChecker } from '@/lib/permissions'
import { useCommission, useRecordCommissionPayment } from '@/queries/commission'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { formatDate } from '@/lib/time'

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
          <h2 className="text-h3 text-text-primary">Pending Dues</h2>
          {data.dues.length === 0 && <p className="mt-sm text-body-sm text-text-secondary">Nothing pending.</p>}
          <div className="mt-sm flex flex-col gap-xs">
            {data.dues.map((due) => (
              <div key={due.id} className="flex items-center justify-between text-body-sm">
                <div>
                  <span className="text-text-primary">{due.applicant_name}</span>
                  {due.reopened_flag && (
                    <Badge color="warning" className="ml-sm">
                      Reopened after recognition
                    </Badge>
                  )}
                </div>
                <span className="text-text-secondary">
                  {(due.amount.amount ?? 0).toLocaleString()} {due.amount.currency} — recognized{' '}
                  {formatDate(due.recognized_at)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <RecordPaymentForm />

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
