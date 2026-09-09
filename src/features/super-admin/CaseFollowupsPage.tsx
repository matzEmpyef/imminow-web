import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { AdminShell } from '@/features/auth/AdminShell'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useCaseFollowups, useRecordFollowup, type CaseFollowupRow } from '@/queries/caseFollowups'
import { formatDate } from '@/lib/time'

/**
 * The payments team's chase list (2026-09-09).
 *
 * Closing a case is a consultancy action, and closing is what makes the commission due — so a
 * consultancy controls when it owes the platform money. The contract enforces the obligation;
 * this page is how the platform notices when it hasn't happened.
 *
 * Nothing on this page closes, recognises or reverses anything, and that is deliberate: an
 * auto-close would move money on a case nobody looked at. Working this queue is a phone call.
 */
export function CaseFollowupsPage() {
  const queue = useCaseFollowups()
  const [noting, setNoting] = useState<CaseFollowupRow | null>(null)

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Follow-ups</h1>
          <p className="text-body-sm text-text-secondary">
            Cases that look stuck. Nothing here closes anything on its own — ring the consultancy, then leave a note so
            the next person knows what was said.
          </p>
        </div>

        {queue.isLoading && <Skeleton className="h-40 rounded-lg" />}
        {queue.isError && <ErrorState message="Could not load the queue." onRetry={() => queue.refetch()} />}
        {queue.data?.items?.length === 0 && (
          <p className="text-body-sm text-text-secondary">Nothing needs chasing right now.</p>
        )}

        <div className="flex flex-col gap-sm">
          {queue.data?.items?.map((row) => (
            <Card key={row.journey_id} className="flex flex-col gap-sm">
              <div className="flex items-start justify-between gap-md">
                <div>
                  <Link to={`/admin/applicants/${row.journey_id}`} className="text-body font-medium text-primary hover:underline">
                    {row.student_name}
                  </Link>
                  <p className="text-caption text-text-secondary">
                    {row.consultancy_name ?? 'Consultancy'} &middot; {row.status?.replace(/_/g, ' ')}
                    {row.outcome && <span> &middot; {row.outcome}</span>}
                  </p>
                </div>
                {/* Sorted on, so shown: a case with money on it and no movement outranks a merely
                    old one. Zero means nothing is at stake yet, which is worth seeing too. */}
                {(row.amount_at_stake_inr ?? 0) > 0 && (
                  <span className="text-body-sm tabular-nums text-text-primary">
                    ₹{(row.amount_at_stake_inr ?? 0).toLocaleString('en-IN')} pending
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-xs">
                {row.signals?.map((s) => (
                  <Badge key={s.code} color={s.ask_student ? 'warning' : 'secondary'}>
                    {s.label}
                  </Badge>
                ))}
              </div>
              {/* The detail line says what the signal MEANS, so a caller does not have to remember
                  five rule definitions to work the queue. */}
              {row.signals?.[0]?.detail && (
                <p className="text-caption text-text-secondary">{row.signals[0].detail}</p>
              )}

              <div className="flex flex-wrap gap-md rounded-md bg-surface-muted px-3 py-sm text-caption text-text-secondary">
                <span>{row.days_since_started ?? '—'} days running</span>
                <span>{row.days_since_last_status_change ?? '—'} days since anything moved</span>
                <span>Case plan {row.case_progress?.case_progress ?? 'none'}</span>
                <span>{row.case_progress?.application_total ?? 0} applications</span>
                <span>{row.case_progress?.offers ?? 0} offers</span>
              </div>

              <div className="flex items-center justify-between gap-md">
                <p className="text-caption text-text-secondary">
                  {row.last_followup ? (
                    <>
                      Last called {formatDate(row.last_followup.created_at!)} &mdash; {row.last_followup.note}
                    </>
                  ) : (
                    'Nobody has called yet.'
                  )}
                </p>
                <Button size="sm" variant="secondary" onClick={() => setNoting(row)}>
                  Log a call
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {noting && <FollowupModal row={noting} onClose={() => setNoting(null)} />}
      </div>
    </AdminShell>
  )
}

function FollowupModal({ row, onClose }: { row: CaseFollowupRow; onClose: () => void }) {
  const record = useRecordFollowup()
  const [note, setNote] = useState('')

  return (
    <Modal
      onClose={onClose}
      title={`Log a call — ${row.student_name}`}
      widthRem={30}
      footer={
        <>
          {record.isError && <p className="mr-auto self-center text-body-sm text-error">{record.error.message}</p>}
          <div className="flex gap-sm">
            <Button
              loading={record.isPending}
              disabled={!note.trim()}
              onClick={() =>
                note.trim() &&
                record.mutate({ journeyId: row.journey_id!, note: note.trim() }, { onSuccess: onClose })
              }
            >
              Save
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm text-text-secondary">
          Who you spoke to and what they said. This is the only record of the call.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Called Priya; she is chasing the college and will close by Friday."
          className="rounded-md border border-border bg-surface px-3 py-sm text-body"
        />
      </div>
    </Modal>
  )
}
