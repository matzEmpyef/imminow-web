// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useClient, useCommissions } from '@/queries/clients'
import { useDeleteInstallment } from '@/queries/commissionEntries'
import { formatDate } from '@/lib/time'
import { usePermission } from '@/lib/permissions'
import { formatAmountOnly, formatMoneyAmount } from '@/lib/money'
import { RecordInstallmentModal } from './RecordInstallmentModal'
import { RecordPrContributionModal } from './RecordPrContributionModal'

// One source's expected-vs-received line with a progress bar — the same treatment for the
// college side and the applicant side so partial payment reads at a glance.
function ExpectedVsReceived({
  label,
  expected,
  received,
}: {
  label: string
  expected: { amount?: number | null; currency: string } | null | undefined
  received: { amount?: number | null; currency: string } | null | undefined
}) {
  if (!expected) return null
  const expectedAmount = expected.amount ?? 0
  const receivedAmount = received?.amount ?? 0
  const pct = expectedAmount > 0 ? Math.min(100, Math.round((receivedAmount / expectedAmount) * 100)) : 0
  const settled = expectedAmount > 0 && receivedAmount >= expectedAmount
  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center justify-between text-body-sm">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-text-secondary">
          {formatAmountOnly(expected.currency, receivedAmount)} / {formatAmountOnly(expected.currency, expectedAmount)}{' '}
          {expected.currency}
          {settled ? ' · fully paid' : pct > 0 ? ` · ${pct}%` : ''}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-background">
        <div className={`h-full rounded-full ${settled ? 'bg-success' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Reworked 2026-08-28: driven by the case's commission entry (created in the Accept popup, or
// directly for PR cases). DELIBERATELY shows no platform cut/rate — tiered visibility puts
// those on the Commission Details page only.
export function CommissionsTab({ clientId }: { clientId: string }) {
  const client = useClient(clientId)
  const commissions = useCommissions(clientId)
  const deleteInstallment = useDeleteInstallment(clientId)
  const canRecord = usePermission('billing.record_payment')
  const [showRecord, setShowRecord] = useState(false)
  const [showPrEntry, setShowPrEntry] = useState(false)
  if (commissions.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (commissions.isError || !commissions.data) {
    return <ErrorState message="Could not load commissions." onRetry={() => commissions.refetch()} />
  }
  const data = commissions.data
  const entry = data.entry
  const isPr = client.data?.case_type === 'pr'

  if (!entry) {
    return (
      <Card className="flex flex-col items-start gap-md">
        <div>
          <h2 className="text-h3 text-text-primary">No commission entry yet</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            {isPr
              ? 'Record the applicant’s agreed contribution to start tracking payments for this PR case.'
              : 'The entry is created when a college is accepted on the Selected Colleges tab — the Accept popup captures the agreed amounts.'}
          </p>
        </div>
        {isPr && canRecord && <Button onClick={() => setShowPrEntry(true)}>Record Applicant Contribution</Button>}
        {showPrEntry && (
          <RecordPrContributionModal
            clientId={clientId}
            finalizedCountry={client.data?.finalized_country ?? null}
            onClose={() => setShowPrEntry(false)}
          />
        )}
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-md">
      <Card className="flex flex-col gap-md">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h2 className="text-h3 text-text-primary">
              {entry.case_type === 'pr'
                ? `PR case — ${entry.destination_country}`
                : (entry.course_name ?? 'Accepted course')}
            </h2>
            <p className="mt-xs text-body-sm text-text-secondary">
              {entry.case_type === 'pr'
                ? 'Applicant contribution'
                : `${entry.college_name ?? ''} · ${entry.destination_country}${entry.course_start ? ` · starts ${entry.course_start.month} ${entry.course_start.year}` : ''}`}
            </p>
          </div>
          <Badge color="info" className="capitalize">
            {entry.payer_method === 'applicant'
              ? 'Applicant pays'
              : entry.payer_method === 'college'
                ? 'College pays'
                : 'Split'}
          </Badge>
        </div>
        <ExpectedVsReceived
          label="From college"
          expected={entry.expected_from_college}
          received={entry.received_from_college}
        />
        <ExpectedVsReceived
          label="From applicant"
          expected={entry.expected_from_student}
          received={entry.received_from_student}
        />
      </Card>

      <Card className="flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text-primary">Payments Received</h2>
          {canRecord && (
            <Button size="sm" onClick={() => setShowRecord(true)}>
              Record Payment
            </Button>
          )}
        </div>
        {data.installments.length === 0 ? (
          <p className="text-body-sm text-text-secondary">
            Nothing received yet — partial payments land here as installments.
          </p>
        ) : (
          <div className="flex flex-col gap-xs">
            {data.installments.map((inst) => (
              <div key={inst.id} className="flex items-center justify-between gap-md text-body-sm">
                <div>
                  <span className="font-medium text-text-primary">{formatMoneyAmount(inst.amount)}</span>
                  <span className="text-text-secondary">
                    {' '}
                    from {inst.source === 'student' ? 'applicant' : 'college'} · {formatDate(inst.received_on)}
                    {inst.note ? ` · ${inst.note}` : ''}
                    {inst.receipt_id ? ' · receipt linked' : ''}
                  </span>
                </div>
                {canRecord && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => deleteInstallment.mutate({ entryId: entry.id, installmentId: inst.id })}
                    disabled={deleteInstallment.isPending}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {deleteInstallment.isError && <p className="text-body-sm text-error">{deleteInstallment.error.message}</p>}
      </Card>

      {(data.invoices.length > 0 || data.receipts.length > 0) && (
        <Card className="flex flex-col gap-md">
          <div>
            <h2 className="text-h3 text-text-primary">Linked Documents</h2>
            <p className="text-caption text-text-secondary">
              Platform invoices and receipts for this case — optional; installments above are the source of truth for
              money received.
            </p>
          </div>
          {data.invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between text-body-sm">
              <span className="text-text-primary">Invoice {inv.number}</span>
              <span className="text-text-secondary">
                {formatMoneyAmount(inv.amount)} — {inv.status}
              </span>
            </div>
          ))}
          {data.receipts.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-body-sm">
              <span className="text-text-primary">Receipt for {r.invoice_number}</span>
              <span className="text-text-secondary">
                {formatMoneyAmount(r.amount)} — {formatDate(r.recorded_at)}
              </span>
            </div>
          ))}
        </Card>
      )}

      {showRecord && (
        <RecordInstallmentModal
          clientId={clientId}
          entry={entry}
          receipts={data.receipts}
          onClose={() => setShowRecord(false)}
        />
      )}
    </div>
  )
}
