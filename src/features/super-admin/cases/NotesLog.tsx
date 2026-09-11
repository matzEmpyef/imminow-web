import { Badge } from '@/components/Badge'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { relativeTime } from '@/lib/time'
import { NOTE_OUTCOME_LABELS } from './labels'
import type { SupportCaseNote } from '@/queries/complaints'

/**
 * The working-note history both the Complaints and Disputes drawers show (2026-09-11) — same
 * `SupportCaseNote` shape either way (`subject_type` is the only thing that differs), newest first
 * per the API contract.
 */
export function NotesLog({
  notes,
  loading,
  error,
  onRetry,
}: {
  notes?: SupportCaseNote[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col gap-sm">
      <p className="text-caption font-medium text-text-secondary">Notes</p>
      {loading && <Skeleton className="h-24 rounded-md" />}
      {error && <ErrorState message="Could not load the notes." onRetry={onRetry} />}
      {!loading && !error && (!notes || notes.length === 0) && (
        <p className="text-body-sm text-text-secondary">No notes yet.</p>
      )}
      {!loading && !error && notes && notes.length > 0 && (
        <ol className="flex flex-col">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-col gap-xs border-b border-border py-sm last:border-b-0">
              <div className="flex items-center justify-between gap-sm">
                <span className="text-body-sm font-medium text-text-primary">{n.author_name ?? 'Someone'}</span>
                <span className="text-caption tabular-nums text-text-secondary">{relativeTime(n.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-body-sm text-text-primary">{n.note}</p>
              {n.outcome && <Badge color="info">{NOTE_OUTCOME_LABELS[n.outcome] ?? n.outcome}</Badge>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
