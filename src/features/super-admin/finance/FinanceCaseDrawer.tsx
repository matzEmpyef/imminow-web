import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { formatDate, formatDateTime } from '@/lib/time'
import { money } from './money'
import type { CommissionDueChange, CommissionDuePart, FinanceCaseRow } from '@/queries/financeDashboard'
import { AddDueModal } from './AddDueModal'
import { OverrideDueModal } from './OverrideDueModal'
import { VoidDueModal } from './VoidDueModal'
import { ReceiveDueModal } from './ReceiveDueModal'
import { CloseDueModal } from './CloseDueModal'
import { ReopenDueModal } from './ReopenDueModal'

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

type BadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

const PART_STATUS_COLOR: Record<string, BadgeColor> = {
  expected: 'secondary',
  due: 'info',
  overdue: 'warning',
  paid: 'success',
  waived: 'secondary',
}
const PART_STATUS_LABEL: Record<string, string> = {
  expected: 'Expected',
  due: 'Due',
  overdue: 'Overdue',
  paid: 'Paid',
  waived: 'Closed',
}

function SummaryStat({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="rounded-md border border-border px-sm py-xs">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={`text-body-sm font-medium tabular-nums ${warning ? 'text-warning' : 'text-text-primary'}`}>{value}</p>
    </div>
  )
}

function partAmount(part: CommissionDuePart): string {
  return money({ amount: part.amount ?? 0, currency: part.currency ?? 'INR' })
}

function partLabel(part: CommissionDuePart, ratePercent: number | null | undefined, tuitionFee: FinanceCaseRow['tuition_fee']): string {
  if (part.kind === 'override') return `Override — ${part.reason ?? 'no reason given'}`
  if (part.kind === 'added') return `Added — ${part.reason ?? 'no reason given'}`
  switch (part.source) {
    case 'student':
      return `Student's fee — ${ratePercent ?? 0}% share`
    case 'student_instalment':
      return `Student payment of ${money(part.instalment_amount ?? { amount: 0, currency: part.currency ?? 'INR' })} received ${
        part.instalment_received_on ? formatDate(part.instalment_received_on) : '—'
      }`
    case 'student_expected':
      return 'Student money not received yet'
    case 'college_instalment':
      return `College instalment of ${money(part.instalment_amount ?? { amount: 0, currency: part.currency ?? 'INR' })} received ${
        part.instalment_received_on ? formatDate(part.instalment_received_on) : '—'
      }`
    case 'college_expected':
      return 'College money not received yet'
    case 'tuition':
      return `Tuition — ${ratePercent ?? 0}% of ${money(tuitionFee ?? { amount: 0, currency: part.currency ?? 'INR' })}`
    default:
      return 'Due'
  }
}

function partDueDateText(part: CommissionDuePart): string {
  if (part.due_on) return formatDate(part.due_on)
  if (part.source === 'college_expected' || part.source === 'college_instalment') return 'When the college pays'
  if (part.source === 'student_expected' || part.source === 'student_instalment') return 'When the student pays'
  return 'When the case closes'
}

function changeText(c: CommissionDueChange): string {
  const amount = money({ amount: c.amount ?? 0, currency: c.currency ?? 'INR' })
  if (c.kind === 'added') {
    const dueOnText = c.due_on ? `, due ${formatDate(c.due_on)}` : ''
    return `Added ${amount}${dueOnText}`
  }
  if (c.kind === 'waived') {
    return `Closed ${amount} without payment`
  }
  const previous =
    c.previous_amount != null
      ? ` (was ${money({ amount: c.previous_amount, currency: c.previous_currency ?? c.currency ?? 'INR' })})`
      : ''
  return `Share overridden to ${amount}${previous}`
}

/**
 * What a single case owes immiNow, and every change Finance has made to it (2026-09-11 rewrite —
 * nothing is due until the case closes as a success; each part is owed in its own currency). Opened
 * from a Cases tab row click. Keeps its own copy of the row so a mutation's returned FinanceCaseRow
 * can refresh the drawer immediately, without waiting on the list query behind it to refetch.
 */
export function FinanceCaseDrawer({ caseRow, onClose }: { caseRow: FinanceCaseRow | null; onClose: () => void }) {
  const [row, setRow] = useState<FinanceCaseRow | null>(caseRow)
  const [addingDue, setAddingDue] = useState(false)
  const [overriding, setOverriding] = useState<'override' | 'clear' | null>(null)
  const [voidingPart, setVoidingPart] = useState<CommissionDuePart | null>(null)
  const [receivingPart, setReceivingPart] = useState<CommissionDuePart | null>(null)
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [closingPart, setClosingPart] = useState<CommissionDuePart | null>(null)
  const [reopeningPart, setReopeningPart] = useState<CommissionDuePart | null>(null)

  useEffect(() => {
    setRow(caseRow)
  }, [caseRow])

  const dueSchedule = row?.due_schedule ?? []
  const dueChanges = row?.due_changes ?? []
  const byCurrency = row?.by_currency ?? []
  const hasOverride = dueSchedule.some((p) => p.kind === 'override')

  return (
    <Drawer open={row != null} onClose={onClose} title={row?.applicant_name ?? 'Case'}>
      {row && (
        <div className="flex flex-col gap-lg">
          <div>
            <p className="text-body-sm text-text-secondary">{row.consultancy_name}</p>
            <p className="text-caption text-text-secondary">
              {row.case_type === 'pr' ? 'PR case' : (row.college_name ?? row.destination_country ?? '—')}
            </p>
            <div className="mt-xs flex items-center gap-xs">
              <span className="text-body-sm text-text-primary">{row.rate_percent != null ? `${row.rate_percent}%` : '—'}</span>
              {row.rate_source === 'fallback_default' && <Badge color="warning">default rate</Badge>}
            </div>
            <p className="mt-xs text-body-sm text-text-primary">
              {row.case_closed ? (
                <>Closed as a success on {formatDate(row.recognized_at)}</>
              ) : (
                'Open — nothing is due until the case closes as a success'
              )}
            </p>
            {row.journey_id && (
              <Link
                to={`/admin/case-followups/${row.journey_id}`}
                className="mt-xs inline-block text-body-sm text-primary hover:underline"
              >
                Open case &rarr;
              </Link>
            )}
          </div>

          <div className="grid grid-cols-2 gap-sm">
            <SummaryStat label="Due (₹)" value={inr(row.due_inr)} />
            <SummaryStat label="Not yet due (₹)" value={inr(row.expected_share_inr)} />
            <SummaryStat label="Paid (₹)" value={inr(row.paid_inr)} />
            <SummaryStat label="Awaiting confirmation (₹)" value={inr(row.awaiting_inr)} />
            <SummaryStat label="Outstanding (₹)" value={inr(row.outstanding_inr)} />
            <SummaryStat label="Overdue (₹)" value={inr(row.overdue_inr)} warning={(row.overdue_inr ?? 0) > 0} />
          </div>

          {byCurrency.length > 0 && (
            <div>
              <h3 className="text-body-sm font-medium text-text-primary">By currency</h3>
              <div className="mt-xs overflow-x-auto rounded-md border border-border">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-border text-caption text-text-secondary">
                      <th className="px-sm py-xs text-left font-medium">Currency</th>
                      <th className="px-sm py-xs text-right font-medium">Due</th>
                      <th className="px-sm py-xs text-right font-medium">Not yet due</th>
                      <th className="px-sm py-xs text-right font-medium">Paid</th>
                      <th className="px-sm py-xs text-right font-medium">Outstanding</th>
                      <th className="px-sm py-xs text-right font-medium">Overdue</th>
                      <th className="px-sm py-xs text-right font-medium">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCurrency.map((c) => (
                      <tr key={c.currency} className="border-b border-border last:border-0">
                        <td className="px-sm py-xs font-medium text-text-primary">{c.currency}</td>
                        <td className="px-sm py-xs text-right tabular-nums">{money({ amount: c.due ?? 0, currency: c.currency ?? 'INR' })}</td>
                        <td className="px-sm py-xs text-right tabular-nums">{money({ amount: c.expected ?? 0, currency: c.currency ?? 'INR' })}</td>
                        <td className="px-sm py-xs text-right tabular-nums">{money({ amount: c.paid ?? 0, currency: c.currency ?? 'INR' })}</td>
                        <td className="px-sm py-xs text-right font-medium tabular-nums text-text-primary">
                          {money({ amount: c.outstanding ?? 0, currency: c.currency ?? 'INR' })}
                        </td>
                        <td className={`px-sm py-xs text-right tabular-nums ${(c.overdue ?? 0) > 0 ? 'text-warning' : ''}`}>
                          {money({ amount: c.overdue ?? 0, currency: c.currency ?? 'INR' })}
                        </td>
                        <td className="px-sm py-xs text-right tabular-nums text-text-secondary">
                          {money({ amount: c.waived ?? 0, currency: c.currency ?? 'INR' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-sm">
            <Button size="sm" onClick={() => setAddingDue(true)}>
              Add amount due
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRecordingPayment(true)}>
              Record a payment
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOverriding('override')}>
              Override share
            </Button>
            {hasOverride && (
              <Button size="sm" variant="secondary" onClick={() => setOverriding('clear')}>
                Remove override
              </Button>
            )}
          </div>

          <div>
            <h3 className="text-body-sm font-medium text-text-primary">What&rsquo;s due</h3>
            <div className="mt-xs flex flex-col gap-xs">
              {dueSchedule.length === 0 && <p className="text-caption text-text-secondary">Nothing due.</p>}
              {dueSchedule.map((part, i) => {
                const label = partLabel(part, row.rate_percent, row.tuition_fee)
                const canSettle = part.status === 'due' || part.status === 'overdue'
                return (
                  <div key={part.key ?? part.id ?? `calculated-${i}`} className="rounded-md border border-border px-sm py-xs">
                    <div className="flex items-start justify-between gap-sm">
                      <span className="text-body-sm text-text-primary">{label}</span>
                      <Badge color={PART_STATUS_COLOR[part.status ?? 'due']}>{PART_STATUS_LABEL[part.status ?? 'due']}</Badge>
                    </div>
                    <p className="text-caption text-text-secondary">
                      {partAmount(part)} · {partDueDateText(part)} · Paid {money({ amount: part.paid ?? 0, currency: part.currency ?? 'INR' })}
                    </p>
                    {part.status === 'waived' && (
                      <p className="text-caption text-text-secondary">
                        Closed without payment by {part.waived_by_name ?? 'Unknown'}
                        {part.waived_at ? ` on ${formatDate(part.waived_at)}` : ''}
                        {part.waived_reason ? `: ${part.waived_reason}` : ''}
                      </p>
                    )}
                    {(canSettle || part.status === 'waived' || part.kind === 'added') && (
                      <div className="mt-xs flex flex-wrap gap-xs">
                        {canSettle && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setReceivingPart(part)}>
                              Mark as received
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setClosingPart(part)}>
                              Close without payment
                            </Button>
                          </>
                        )}
                        {part.kind === 'added' && part.status !== 'waived' && (
                          <Button size="sm" variant="secondary" onClick={() => setVoidingPart(part)}>
                            Remove
                          </Button>
                        )}
                        {part.status === 'waived' && (
                          <Button size="sm" variant="secondary" onClick={() => setReopeningPart(part)}>
                            Reopen
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {dueChanges.length > 0 && (
            <div>
              <h3 className="text-body-sm font-medium text-text-primary">Change history</h3>
              <div className="mt-xs flex flex-col gap-xs">
                {dueChanges.map((c) => (
                  <div key={c.id} className="rounded-md border border-border px-sm py-xs">
                    <p className={`text-body-sm ${c.voided_at ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                      {c.changed_by_name ?? 'Unknown'} · {c.changed_at ? formatDate(c.changed_at) : ''} — {changeText(c)}
                      {c.reason ? `: ${c.reason}` : ''}
                    </p>
                    {c.voided_at && (
                      <p className="text-caption text-error">
                        {c.kind === 'waived' ? 'Reopened' : 'Removed'} by {c.voided_by_name ?? 'Unknown'}
                        {c.void_reason ? `: ${c.void_reason}` : ''} · {formatDateTime(c.voided_at)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {row && addingDue && (
        <AddDueModal
          caseRow={row}
          onClose={() => setAddingDue(false)}
          onAdded={(next) => {
            setRow(next)
            setAddingDue(false)
          }}
        />
      )}
      {row && overriding && (
        <OverrideDueModal
          caseRow={row}
          mode={overriding}
          onClose={() => setOverriding(null)}
          onChanged={(next) => {
            setRow(next)
            setOverriding(null)
          }}
        />
      )}
      {row && voidingPart && (
        <VoidDueModal
          caseRow={row}
          part={voidingPart}
          onClose={() => setVoidingPart(null)}
          onVoided={(next) => {
            setRow(next)
            setVoidingPart(null)
          }}
        />
      )}
      {row && receivingPart && (
        <ReceiveDueModal
          caseRow={row}
          part={receivingPart}
          label={partLabel(receivingPart, row.rate_percent, row.tuition_fee)}
          onClose={() => setReceivingPart(null)}
          onReceived={(next) => {
            setRow(next)
            setReceivingPart(null)
          }}
        />
      )}
      {row && recordingPayment && (
        <ReceiveDueModal
          caseRow={row}
          part={null}
          onClose={() => setRecordingPayment(false)}
          onReceived={(next) => {
            setRow(next)
            setRecordingPayment(false)
          }}
        />
      )}
      {row && closingPart && (
        <CloseDueModal
          caseRow={row}
          part={closingPart}
          label={partLabel(closingPart, row.rate_percent, row.tuition_fee)}
          onClose={() => setClosingPart(null)}
          onClosed={(next) => {
            setRow(next)
            setClosingPart(null)
          }}
        />
      )}
      {row && reopeningPart && (
        <ReopenDueModal
          caseRow={row}
          part={reopeningPart}
          onClose={() => setReopeningPart(null)}
          onReopened={(next) => {
            setRow(next)
            setReopeningPart(null)
          }}
        />
      )}
    </Drawer>
  )
}
