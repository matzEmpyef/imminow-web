// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { CountryLabel } from '@/components/CountryLabel'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useClient, useCommissions } from '@/queries/clients'
import { formatDate } from '@/lib/time'
import { usePermission } from '@/lib/permissions'
import { formatAmountOnly, formatApprox, formatMoneyAmount } from '@/lib/money'
import { RecordInstallmentModal } from './RecordInstallmentModal'
import { RecordPrContributionModal } from './RecordPrContributionModal'
import { VoidInstallmentModal } from './VoidInstallmentModal'
import { VoidPrContributionModal } from './VoidPrContributionModal'
import { BOOKKEEPING_CAPTION, isBookkeepingChannel } from './bookkeeping'
import type { components } from '@/api/schema'

type PayerProgress = components['schemas']['PayerProgress']
type MoneyWithApprox = components['schemas']['Money']

// One payer's expected-vs-received line with a progress bar — the same treatment for the college
// side and the applicant side so partial payment reads at a glance.
//
// EVERY FIGURE IS THE SERVER'S (review F-160). This used to compare `expected` with `received`
// itself, and the two can be in different currencies: ₹60,000 received against CAD 1,000 expected
// read "60,000 / 1,000 CAD · fully paid". The entry now carries `college_progress` /
// `student_progress`: expected, received and remaining in the currency agreed with that payer,
// whether it is fully paid, and whether some of it arrived in another currency and was converted.
// Nothing here subtracts, divides or compares an amount.
function PayerProgressLine({
  label,
  expected,
  received,
  progress,
}: {
  label: string
  /** The agreed amount, for its "≈" in the consultancy's own currency (2026-09-10). */
  expected: MoneyWithApprox | null | undefined
  received: MoneyWithApprox | null | undefined
  progress: PayerProgress | null | undefined
}) {
  if (!progress) {
    // No progress from the server (nothing agreed with this payer, or a server that does not send
    // it yet): the two amounts as they are, each in its own currency, and no judgement about them.
    if (!expected) return null
    const approx = formatApprox(expected.approx)
    return (
      <div className="flex flex-col gap-xs" data-testid="expected-vs-received" data-progress="none">
        <div className="flex items-center justify-between gap-md text-body-sm">
          <span className="font-medium text-text-primary">{label}</span>
          <span className="text-right text-text-secondary">
            {received ? `${formatMoneyAmount(received)} received · ` : ''}
            {formatMoneyAmount(expected)}
            {approx ? ` (${approx})` : ''} expected
          </span>
        </div>
      </div>
    )
  }
  const currency = progress.expected.currency
  const approx = formatApprox(expected?.approx)
  return (
    <div className="flex flex-col gap-xs" data-testid="expected-vs-received" data-progress="server">
      <div className="flex items-center justify-between gap-md text-body-sm">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-right text-text-secondary">
          {formatAmountOnly(currency, progress.received.amount)} / {formatAmountOnly(currency, progress.expected.amount)}{' '}
          {currency}
          {approx ? ` (${approx})` : ''}
          {progress.fully_paid ? ' · fully paid' : ` · ${formatMoneyAmount(progress.remaining)} remaining`}
        </span>
      </div>
      {/* The bar is drawn from the server's own percentage: the unpaid share (`shortfall_percent`)
          is the empty stretch at the end of a full bar, so no percentage is worked out here. */}
      <div className={`relative h-1.5 overflow-hidden rounded-full ${progress.fully_paid ? 'bg-success' : 'bg-primary'}`}>
        <div
          className="absolute inset-y-0 right-0 bg-background"
          style={{ width: `${progress.fully_paid ? 0 : progress.shortfall_percent}%` }}
        />
      </div>
      {progress.converted && (
        <p className="text-caption text-text-secondary">
          Some of this arrived in another currency and is counted in {currency} at the value fixed when it was recorded.
        </p>
      )}
    </div>
  )
}

// Reworked 2026-08-28: driven by the case's commission entry (created in the Accept popup, or
// directly for PR cases). DELIBERATELY shows no platform cut/rate — tiered visibility puts
// those on the Commission Details page only.
export function CommissionsTab({ clientId }: { clientId: string }) {
  const client = useClient(clientId)
  const commissions = useCommissions(clientId)
  const canRecord = usePermission('billing.record_payment')
  const [showRecord, setShowRecord] = useState(false)
  const [showPrEntry, setShowPrEntry] = useState(false)
  const [voidingPrEntry, setVoidingPrEntry] = useState(false)
  const [voiding, setVoiding] = useState<components['schemas']['CommissionInstallment'] | null>(null)
  if (commissions.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (commissions.isError || !commissions.data) {
    return <ErrorState message="Could not load commissions." onRetry={() => commissions.refetch()} error={commissions.error} />
  }
  const data = commissions.data
  const entry = data.entry
  const isPr = client.data?.case_type === 'pr'
  // A case that ended without success, or moved away, takes no new money: the record buttons are
  // not offered and nothing invites a new entry (T1-10). A case that closed as a success keeps
  // working — a payment can still arrive after the close.
  const status = client.data?.status
  const closed = status === 'closed' || status === 'closed_switched' || status === 'closed_completed'
  const noNewMoney = (status === 'closed' || status === 'closed_switched') && client.data?.outcome !== 'success'
  // Own-client bookkeeping: installments work as usual; the tab has no Sentpo figure and no
  // declare-payment control for any channel, so the only difference is the explanatory caption.
  const bookkeeping = isBookkeepingChannel(entry?.channel, client.data?.acquisition_source)

  if (!entry && closed) {
    // The server stops tracking a case's commission once it closes without success, so there is
    // nothing to show and nothing to start. Whether the reversed record is shown here is the
    // owner's open question (T2-01); until then the page says only what is true.
    return (
      <Card className="flex flex-col items-start gap-md">
        <div>
          <h2 className="text-h3 text-text-primary">No commission entry</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            This case is closed, so no commission is being tracked on it and nothing new can be recorded. If money was
            recorded on it before it closed, immiNow Finance still has that record.
          </p>
          {bookkeeping && <p className="mt-xs text-caption text-text-secondary">{BOOKKEEPING_CAPTION}</p>}
        </div>
      </Card>
    )
  }

  if (!entry) {
    return (
      <Card className="flex flex-col items-start gap-md">
        <div>
          <h2 className="text-h3 text-text-primary">No commission entry yet</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            {isPr
              ? 'Record the applicant’s agreed contribution to start tracking payments for this PR case.'
              : 'The entry is created when a college is accepted on the Applications tab — the Accept popup captures the agreed amounts.'}
          </p>
          {bookkeeping && <p className="mt-xs text-caption text-text-secondary">{BOOKKEEPING_CAPTION}</p>}
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
                ? <>PR case — <CountryLabel name={entry.destination_country} /></>
                : (entry.course_name ?? 'Accepted course')}
            </h2>
            <p className="mt-xs text-body-sm text-text-secondary">
              {entry.case_type === 'pr'
                ? 'Applicant contribution'
                : <>
                    {entry.college_name ?? ''} · <CountryLabel name={entry.destination_country} />
                    {entry.course_start ? ` · starts ${entry.course_start.month} ${entry.course_start.year}` : ''}
                  </>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-sm">
            <Badge color="info" className="capitalize">
              {entry.payer_method === 'applicant'
                ? 'Applicant pays'
                : entry.payer_method === 'college'
                  ? 'College pays'
                  : 'Split'}
            </Badge>
            {/* A PR contribution recorded with the wrong amount or currency is voided here and
                recorded again (review F-081). Same permission as recording it. A student case's
                entry is undone by reverting the acceptance on the Applications tab instead. */}
            {entry.case_type === 'pr' && canRecord && !noNewMoney && (
              <Button size="sm" variant="secondary" onClick={() => setVoidingPrEntry(true)}>
                Void contribution
              </Button>
            )}
          </div>
        </div>
        {bookkeeping && <p className="text-caption text-text-secondary">{BOOKKEEPING_CAPTION}</p>}
        <PayerProgressLine
          label="From college"
          expected={entry.expected_from_college}
          received={entry.received_from_college}
          progress={entry.college_progress}
        />
        <PayerProgressLine
          label="From applicant"
          expected={entry.expected_from_student}
          received={entry.received_from_student}
          progress={entry.student_progress}
        />
      </Card>

      <Card className="flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text-primary">Payments Received</h2>
          {canRecord && !noNewMoney && (
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
            {data.installments.map((inst) => {
              const isVoid = Boolean(inst.voided_at)
              // The share of this installment has already fallen due, so its void waits for Sentpo
              // Finance (review F-078). Nothing has changed yet: the installment still counts.
              const voidWaiting = !isVoid && Boolean(inst.void_requested_at)
              return (
                <div key={inst.id} className="flex items-center justify-between gap-md text-body-sm">
                  <div className={isVoid ? 'text-text-secondary' : undefined}>
                    <span className={`font-medium ${isVoid ? 'line-through' : 'text-text-primary'}`}>
                      {formatMoneyAmount(inst.amount)}
                    </span>
                    {!isVoid && formatApprox(inst.amount.approx) && (
                      <span className="text-text-secondary"> ({formatApprox(inst.amount.approx)})</span>
                    )}
                    <span className="text-text-secondary">
                      {' '}
                      from {inst.source === 'student' ? 'applicant' : 'college'} · {formatDate(inst.received_on)}
                      {inst.note ? ` · ${inst.note}` : ''}
                      {inst.receipt_id ? ' · receipt linked' : ''}
                    </span>
                    {isVoid && (
                      <span className="mt-xs block text-caption text-text-secondary">
                        Voided{inst.voided_by_name ? ` by ${inst.voided_by_name}` : ''}
                        {inst.voided_at ? ` on ${formatDate(inst.voided_at)}` : ''}
                        {inst.voided_reason ? ` — ${inst.voided_reason}` : ''}
                      </span>
                    )}
                    {voidWaiting && (
                      <span className="mt-xs block text-caption text-text-secondary">
                        Void requested{inst.void_requested_at ? ` on ${formatDate(inst.void_requested_at)}` : ''}
                        {inst.void_request_reason ? ` — ${inst.void_request_reason}` : ''}
                      </span>
                    )}
                  </div>
                  {isVoid ? (
                    <Badge color="secondary">Void</Badge>
                  ) : voidWaiting ? (
                    <Badge color="warning">Waiting for immiNow Finance</Badge>
                  ) : (
                    canRecord &&
                    !noNewMoney && (
                      <Button size="sm" variant="secondary" onClick={() => setVoiding(inst)}>
                        Void
                      </Button>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
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

      {voidingPrEntry && (
        <VoidPrContributionModal
          clientId={clientId}
          contribution={entry.expected_from_student}
          onClose={() => setVoidingPrEntry(false)}
        />
      )}

      {voiding && (
        <VoidInstallmentModal clientId={clientId} entryId={entry.id} installment={voiding} onClose={() => setVoiding(null)} />
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
