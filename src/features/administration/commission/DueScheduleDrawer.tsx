import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { formatDate } from '@/lib/time'
import { formatMoneyAmount } from '@/lib/money'
import type { components } from '@/api/schema'

type CommissionDue = components['schemas']['CommissionDue']
type CommissionDuePart = components['schemas']['CommissionDuePart']

const money = formatMoneyAmount

type BadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

const STATUS_COLOR: Record<string, BadgeColor> = { expected: 'secondary', due: 'info', overdue: 'warning', paid: 'success' }
const STATUS_LABEL: Record<string, string> = { expected: 'Expected', due: 'Due', overdue: 'Overdue', paid: 'Paid' }

function partLabel(
  part: CommissionDuePart,
  ratePercent: number | null | undefined,
  tuitionFee?: { amount?: number | null; currency?: string | null } | null,
): string {
  if (part.kind === 'override') return `Override — ${part.reason ?? 'no reason given'}`
  if (part.kind === 'added') return `Added — ${part.reason ?? 'no reason given'}`
  switch (part.source) {
    case 'student':
      return `Student's fee — ${ratePercent ?? 0}% share`
    case 'college_instalment':
      return `College instalment of ${money(part.instalment_amount)} received ${
        part.instalment_received_on ? formatDate(part.instalment_received_on) : '—'
      }`
    case 'college_expected':
      return 'College money not received yet'
    case 'tuition':
      return tuitionFee?.amount != null
        ? `Tuition — ${ratePercent ?? 0}% of ${money({ amount: tuitionFee.amount, currency: tuitionFee.currency ?? 'INR' })}`
        : `Tuition — ${ratePercent ?? 0}% share`
    default:
      return 'Due'
  }
}

function partDueDateText(part: CommissionDuePart): string {
  if (part.due_on) return formatDate(part.due_on)
  if (part.source === 'college_expected' || part.source === 'college_instalment') return 'When the college pays'
  return 'When the case closes'
}

/**
 * What a case owes immiNow and when (consultancy view, 2026-09-11) — Active Cases' "View
 * schedule" popover. Same due_schedule Finance sees on their side, minus who at immiNow added a
 * part — that detail is internal (CommissionDue's doc comment).
 */
export function DueScheduleDrawer({ due, onClose }: { due: CommissionDue | null; onClose: () => void }) {
  const schedule = due?.due_schedule ?? []
  return (
    <Drawer open={due != null} onClose={onClose} title={due?.applicant_name ?? 'Due schedule'}>
      <div className="flex flex-col gap-xs">
        {schedule.length === 0 && <p className="text-caption text-text-secondary">Nothing due.</p>}
        {schedule.map((part, i) => (
          <div key={part.id ?? `calculated-${i}`} className="rounded-md border border-border px-sm py-xs">
            <div className="flex items-start justify-between gap-sm">
              <span className="text-body-sm text-text-primary">{partLabel(part, due?.rate_percent, due?.tuition_fee)}</span>
              {part.status && <Badge color={STATUS_COLOR[part.status]}>{STATUS_LABEL[part.status]}</Badge>}
            </div>
            <p className="text-caption text-text-secondary">
              {money({ amount: part.amount, currency: part.currency })} · {partDueDateText(part)} · Paid{' '}
              {money({ amount: part.paid, currency: part.currency })}
            </p>
          </div>
        ))}
      </div>
    </Drawer>
  )
}
