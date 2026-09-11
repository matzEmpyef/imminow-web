import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { formatDate, formatDateTime } from '@/lib/time'
import type { CommissionDuePart, FinanceCaseRow } from '@/queries/financeDashboard'
import { AddDueModal } from './AddDueModal'
import { OriginalDueModal } from './OriginalDueModal'
import { VoidDueModal } from './VoidDueModal'

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

type BadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

const PART_STATUS_COLOR: Record<string, BadgeColor> = { paid: 'success', overdue: 'warning', due: 'info', upcoming: 'secondary' }
const PART_STATUS_LABEL: Record<string, string> = { paid: 'Paid', overdue: 'Overdue', due: 'Due', upcoming: 'Upcoming' }

function SummaryStat({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="rounded-md border border-border px-sm py-xs">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={`text-body-sm font-medium tabular-nums ${warning ? 'text-warning' : 'text-text-primary'}`}>{value}</p>
    </div>
  )
}

function partLabel(part: CommissionDuePart, ratePercent: number | null | undefined): string {
  if (part.kind === 'original') return `Original — ${ratePercent ?? 0}% of the expected amount`
  return `Added — ${part.reason ?? 'no reason given'}`
}

/**
 * What a single case owes immiNow, and every change Finance has made to it (2026-09-11). Opened
 * from a Cases tab row click. Keeps its own copy of the row so a mutation's returned FinanceCaseRow
 * can refresh the drawer immediately, without waiting on the list query behind it to refetch.
 */
export function FinanceCaseDrawer({ caseRow, onClose }: { caseRow: FinanceCaseRow | null; onClose: () => void }) {
  const [row, setRow] = useState<FinanceCaseRow | null>(caseRow)
  const [addingDue, setAddingDue] = useState(false)
  const [editingOriginal, setEditingOriginal] = useState(false)
  const [voidingPart, setVoidingPart] = useState<CommissionDuePart | null>(null)

  useEffect(() => {
    setRow(caseRow)
  }, [caseRow])

  const dueSchedule = row?.due_schedule ?? []
  const dueChanges = row?.due_changes ?? []

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
            <SummaryStat label="Total due" value={inr(row.due_inr)} />
            <SummaryStat label="Paid" value={inr(row.paid_inr)} />
            <SummaryStat label="Awaiting confirmation" value={inr(row.awaiting_inr)} />
            <SummaryStat label="Outstanding" value={inr(row.outstanding_inr)} />
            <SummaryStat label="Overdue" value={inr(row.overdue_inr)} warning={(row.overdue_inr ?? 0) > 0} />
          </div>

          <div className="flex flex-wrap gap-sm">
            <Button size="sm" onClick={() => setAddingDue(true)}>
              Add amount due
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditingOriginal(true)}>
              Edit original amount
            </Button>
          </div>

          <div>
            <h3 className="text-body-sm font-medium text-text-primary">What&rsquo;s due</h3>
            <div className="mt-xs flex flex-col gap-xs">
              {dueSchedule.length === 0 && <p className="text-caption text-text-secondary">Nothing due.</p>}
              {dueSchedule.map((part, i) => (
                <div key={part.id ?? `original-${i}`} className="rounded-md border border-border px-sm py-xs">
                  <div className="flex items-start justify-between gap-sm">
                    <span className="text-body-sm text-text-primary">{partLabel(part, row.rate_percent)}</span>
                    <Badge color={PART_STATUS_COLOR[part.status ?? 'due']}>{PART_STATUS_LABEL[part.status ?? 'due']}</Badge>
                  </div>
                  <p className="text-caption text-text-secondary">
                    {inr(part.amount_inr)} · {part.due_on ? formatDate(part.due_on) : 'No date'} · Paid {inr(part.paid_inr)}
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
                {dueChanges.map((c) => {
                  const dueOnText = c.due_on ? `, due ${formatDate(c.due_on)}` : ''
                  // A date-only change used to read "₹45,600 → ₹45,600"; say what actually moved.
                  const amountChanged = c.previous_amount_inr != null && c.previous_amount_inr !== c.amount_inr
                  const dateChanged = (c.previous_due_on ?? null) !== (c.due_on ?? null)
                  const originalText = [
                    amountChanged
                      ? `Original ${inr(c.previous_amount_inr ?? undefined)} → ${inr(c.amount_inr)}`
                      : `Original ${inr(c.amount_inr)}`,
                    dateChanged ? (c.due_on ? `due date set to ${formatDate(c.due_on)}` : 'due date removed') : '',
                  ]
                    .filter(Boolean)
                    .join(', ')
                  const mainText = c.kind === 'added' ? `Added ${inr(c.amount_inr)}${dueOnText}` : originalText
                  return (
                    <div key={c.id} className="rounded-md border border-border px-sm py-xs">
                      <p className={`text-body-sm ${c.voided_at ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                        {c.changed_by_name ?? 'Unknown'} · {c.changed_at ? formatDate(c.changed_at) : ''} — {mainText}
                        {c.reason ? `: ${c.reason}` : ''}
                      </p>
                      {c.voided_at && (
                        <p className="text-caption text-error">
                          Removed by {c.voided_by_name ?? 'Unknown'}
                          {c.void_reason ? `: ${c.void_reason}` : ''} · {formatDateTime(c.voided_at)}
                        </p>
                      )}
                    </div>
                  )
                })}
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
      {row && editingOriginal && (
        <OriginalDueModal
          caseRow={row}
          onClose={() => setEditingOriginal(false)}
          onChanged={(next) => {
            setRow(next)
            setEditingOriginal(false)
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
