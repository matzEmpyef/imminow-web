import { Badge } from '@/components/Badge'

export interface FollowupSignal {
  code?: string
  label?: string
  detail?: string
  ask_student?: boolean
}

/**
 * The badge row both follow-up queues show for a row's signals (2026-09-11). Warning colour for
 * anything `ask_student` — those escalate straight to the student rather than through the
 * consultancy first, so they read as more urgent than the rest.
 */
export function SignalBadges({ signals, className }: { signals?: FollowupSignal[]; className?: string }) {
  if (!signals || signals.length === 0) {
    return <span className="text-caption text-text-secondary">—</span>
  }
  return (
    <div className={`flex flex-wrap gap-xs ${className ?? ''}`}>
      {signals.map((s) => (
        <Badge key={s.code} color={s.ask_student ? 'warning' : 'secondary'}>
          {s.label}
        </Badge>
      ))}
    </div>
  )
}
