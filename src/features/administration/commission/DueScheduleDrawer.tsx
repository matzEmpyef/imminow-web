import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type CommissionDue = components['schemas']['CommissionDue']
type CommissionDuePart = components['schemas']['CommissionDuePart']

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

type BadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

const STATUS_COLOR: Record<string, BadgeColor> = { paid: 'success', overdue: 'warning', due: 'info', upcoming: 'secondary' }
const STATUS_LABEL: Record<string, string> = { paid: 'Paid', overdue: 'Overdue', due: 'Due', upcoming: 'Upcoming' }

function partLabel(part: CommissionDuePart, ratePercent: number | undefined): string {
  if (part.kind === 'original') return `Original — ${ratePercent ?? 0}% of the expected amount`
  return `Added — ${part.reason ?? 'no reason given'}`
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
          <div key={part.id ?? `original-${i}`} className="rounded-md border border-border px-sm py-xs">
            <div className="flex items-start justify-between gap-sm">
              <span className="text-body-sm text-text-primary">{partLabel(part, due?.rate_percent)}</span>
              {part.status && <Badge color={STATUS_COLOR[part.status]}>{STATUS_LABEL[part.status]}</Badge>}
            </div>
            <p className="text-caption text-text-secondary">
              {inr(part.amount_inr)} · {part.due_on ? formatDate(part.due_on) : 'No date'}
            </p>
          </div>
        ))}
      </div>
    </Drawer>
  )
}
