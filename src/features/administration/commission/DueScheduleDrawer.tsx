import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { formatMoneyAmount } from '@/lib/money'
import { duePartDueDateText, duePartLabel } from '@/lib/duePart'
import type { components } from '@/api/schema'

type CommissionDue = components['schemas']['CommissionDue']

const money = formatMoneyAmount

type BadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

const STATUS_COLOR: Record<string, BadgeColor> = {
  expected: 'secondary',
  due: 'info',
  overdue: 'warning',
  paid: 'success',
  waived: 'secondary',
}
const STATUS_LABEL: Record<string, string> = {
  expected: 'Expected',
  due: 'Due',
  overdue: 'Overdue',
  paid: 'Paid',
  waived: 'Closed by immiNow',
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
              <span className="text-body-sm text-text-primary">{duePartLabel(part, due?.rate_percent, due?.tuition_fee, money)}</span>
              {part.status && <Badge color={STATUS_COLOR[part.status]}>{STATUS_LABEL[part.status]}</Badge>}
            </div>
            <p className="text-caption text-text-secondary">
              {money({ amount: part.amount, currency: part.currency })} · {duePartDueDateText(part)} · Paid{' '}
              {money({ amount: part.paid, currency: part.currency })}
            </p>
            {part.status === 'waived' && part.waived_reason && (
              <p className="text-caption text-text-secondary">Closed without payment: {part.waived_reason}</p>
            )}
          </div>
        ))}
      </div>
    </Drawer>
  )
}
