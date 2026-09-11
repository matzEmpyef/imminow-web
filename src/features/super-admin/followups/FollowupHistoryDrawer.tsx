import { Bell } from 'lucide-react'
import type { ReactNode } from 'react'
import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { relativeTime, formatDate } from '@/lib/time'
import type { FollowupNote } from '@/queries/caseFollowups'
import { OUTCOME_LABELS } from './labels'
import type { FollowupSignal } from './SignalBadges'

interface FollowupHistoryDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  signals?: FollowupSignal[]
  /** Page-specific stats — case progress on the payment page, profile/intake on the student page. */
  details?: ReactNode
  notes?: FollowupNote[]
  notesLoading?: boolean
  notesError?: boolean
  onRetryNotes?: () => void
  actions?: ReactNode
}

/**
 * The read-only side panel both follow-up queues open on a row click (2026-09-11): who/what this
 * is, every signal with its plain-English reason, the full call history, then the actions
 * ("Log a call" plus a link to the case or the student). Dismissible — unlike LogCallModal, this
 * shows nothing that can be lost by a stray click outside it.
 */
export function FollowupHistoryDrawer({
  open,
  onClose,
  title,
  subtitle,
  signals,
  details,
  notes,
  notesLoading,
  notesError,
  onRetryNotes,
  actions,
}: FollowupHistoryDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} title={title} dismissible>
      <div className="flex flex-col gap-lg">
        <div>
          <p className="font-medium text-text-primary">{title}</p>
          {subtitle && <p className="text-caption text-text-secondary">{subtitle}</p>}
        </div>

        {signals && signals.length > 0 && (
          <div className="flex flex-col gap-sm">
            <p className="text-caption font-medium text-text-secondary">Why this is here</p>
            <div className="flex flex-col gap-xs">
              {signals.map((s) => (
                <div key={s.code} className="flex flex-col gap-xs rounded-md border border-border p-sm">
                  <Badge color={s.ask_student ? 'warning' : 'secondary'}>{s.label}</Badge>
                  {s.detail && <p className="text-caption text-text-secondary">{s.detail}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {details}

        <div className="flex flex-col gap-sm">
          <p className="text-caption font-medium text-text-secondary">Call history</p>
          {notesLoading && <Skeleton className="h-24 rounded-md" />}
          {notesError && <ErrorState message="Could not load the call history." onRetry={onRetryNotes} />}
          {!notesLoading && !notesError && (!notes || notes.length === 0) && (
            <p className="text-body-sm text-text-secondary">Nobody has reached out yet.</p>
          )}
          {!notesLoading && !notesError && notes && notes.length > 0 && (
            <ol className="flex flex-col">
              {notes.map((n) => (
                <li key={n.id} className="flex flex-col gap-xs border-b border-border py-sm last:border-b-0">
                  <div className="flex items-center justify-between gap-sm">
                    <span className="flex items-center gap-xs text-body-sm font-medium text-text-primary">
                      {n.kind === 'nudge' ? (
                        <>
                          <Bell className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
                          Push sent
                        </>
                      ) : (
                        (n.author_name ?? 'Someone')
                      )}
                    </span>
                    <span className="text-caption tabular-nums text-text-secondary">{relativeTime(n.created_at)}</span>
                  </div>
                  <p className="text-body-sm text-text-primary">{n.note}</p>
                  {(n.outcome || n.call_back_on) && (
                    <div className="flex flex-wrap items-center gap-xs">
                      {n.outcome && <Badge color="info">{OUTCOME_LABELS[n.outcome] ?? n.outcome}</Badge>}
                      {n.call_back_on && (
                        <span className="text-caption text-text-secondary">Call back {formatDate(n.call_back_on)}</span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {actions && <div className="flex flex-wrap gap-sm pt-sm">{actions}</div>}
      </div>
    </Drawer>
  )
}
