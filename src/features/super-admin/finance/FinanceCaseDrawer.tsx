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

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

type BadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

const PART_STATUS_COLOR: Record<string, BadgeColor> = { expected: 'secondary', due: 'info', overdue: 'warning', paid: 'success' }
const PART_STATUS_LABEL: Record<string, string> = { expected: 'Expected', due: 'Due', overdue: 'Overdue', paid: 'Paid' }

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
  return 'When the case closes'
}

function changeText(c: CommissionDueChange): string {
  const amount = money({ amount: c.amount ?? 0, currency: c.currency ?? 'INR' })
  if (c.kind === 'added') {
    const dueOnText = c.due_on ? `, due ${formatDate(c.due_on)}` : ''
    return `Added ${amount}${dueOnText}`
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
              {dueSchedule.map((part, i) => (
                <div key={part.id ?? `calculated-${i}`} className="rounded-md border border-border px-sm py-xs">
                  <div className="flex items-start justify-between gap-sm">
                    <span className="text-body-sm text-text-primary">{partLabel(part, row.rate_percent, row.tuition_fee)}</span>
                    <Badge color={PART_STATUS_COLOR[part.status ?? 'due']}>{PART_STATUS_LABEL[part.status ?? 'due']}</Badge>
                  </div>
                  <p className="text-caption text-text-secondary">
                    {partAmount(part)} · {partDueDateText(part)} · Paid {money({ amount: part.paid ?? 0, currency: part.currency ?? 'INR' })}
                  </p>
                  {part.kind === 'added' && (
                    <div className="mt-xs">
                      <Button size="sm" variant="secondary" onClick={() => setVoidingPart(part)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              ))}
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
                        Removed by {c.voided_by_name ?? 'Unknown'}
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
    </Drawer>
  )
}
