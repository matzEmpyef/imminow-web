import { useState } from 'react'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { AdminShell } from '@/features/auth/AdminShell'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { DISPUTE_ACTIONS, useDisputes, useResolveDispute, type CaseDispute, type DisputeAction } from '@/queries/disputes'

/**
 * The platform's dispute queue (2026-09-09). A dispute is not a way of closing a case — it is the
 * state a case sits in WHILE the platform decides, so this page is where every frozen case waits.
 * Both sides land here: a consultancy raising an issue, and (via the existing complaint flow) a
 * student raising one.
 */
function plural(n: number | undefined, noun: string) {
  const count = n ?? 0
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function DisputesPage() {
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open')
  const disputes = useDisputes(status)
  const [resolving, setResolving] = useState<CaseDispute | null>(null)

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Disputes</h1>
          <p className="text-body-sm text-text-secondary">
            Cases frozen while Sentpo decides. The plan and chat are paused for both sides until you resolve one, so a
            case sitting here is a case nobody can move.
          </p>
        </div>

      <div className="flex gap-sm">
        {(['open', 'resolved', 'all'] as const).map((s) => (
          <Button key={s} size="sm" variant={status === s ? 'primary' : 'secondary'} onClick={() => setStatus(s)}>
            {s === 'all' ? 'All' : s === 'open' ? 'Open' : 'Resolved'}
          </Button>
        ))}
      </div>

      {disputes.isLoading && <Skeleton className="h-40 rounded-lg" />}
      {disputes.isError && (
        <ErrorState message="Could not load the dispute queue." onRetry={() => disputes.refetch()} />
      )}
      {disputes.data?.items?.length === 0 && (
        <p className="text-body-sm text-text-secondary">No case is waiting on a decision from Sentpo right now.</p>
      )}

      <div className="flex flex-col gap-sm">
        {disputes.data?.items?.map((d) => (
          <Card key={d.id} className="flex flex-col gap-sm">
            <div className="flex items-start justify-between gap-md">
              <div>
                <p className="text-body font-medium text-text-primary">{d.student_name ?? 'Student'}</p>
                <p className="text-caption text-text-secondary">
                  {d.consultancy_name ?? 'Consultancy'} &middot; raised by {d.raised_by} &middot;{' '}
                  {new Date(d.created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge color={d.status === 'open' ? 'warning' : 'secondary'}>{d.status}</Badge>
            </div>

            <p className="text-body-sm text-text-primary">{d.reason}</p>

            {/* How far along the case was. A consultancy most of the way through a case has a
                very different claim from one that never started, and without this the mediator is
                deciding blind. */}
            {d.case_progress && (
              <div className="flex flex-wrap gap-md rounded-md bg-surface-muted px-3 py-sm text-caption text-text-secondary">
                <span>
                  {d.case_progress.plan_progress ?? 'No plan'}
                  {(d.case_progress.plan_count ?? 0) > 1 && ` across ${d.case_progress.plan_count} plans`}
                </span>
                <span>{plural(d.case_progress.application_total, 'application')}</span>
                <span>{plural(d.case_progress.offers, 'offer')}</span>
                <span>{d.case_progress.accepted ?? 0} accepted</span>
                <span>{d.case_progress.rejected ?? 0} rejected</span>
              </div>
            )}

            {d.status === 'open' ? (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setResolving(d)}>
                  Resolve
                </Button>
              </div>
            ) : (
              <p className="text-caption text-text-secondary">
                <strong className="text-text-primary">{d.resolution_action}</strong> &mdash; {d.resolution_note}
              </p>
            )}
          </Card>
        ))}
      </div>

        {resolving && <ResolveModal dispute={resolving} onClose={() => setResolving(null)} />}
      </div>
    </AdminShell>
  )
}

function ResolveModal({ dispute, onClose }: { dispute: CaseDispute; onClose: () => void }) {
  const resolve = useResolveDispute()
  const [action, setAction] = useState<DisputeAction | ''>('')
  const [note, setNote] = useState('')
  const canSubmit = action !== '' && Boolean(note.trim())

  return (
    <Modal
      onClose={onClose}
      title={`Resolve — ${dispute.student_name ?? 'case'}`}
      widthRem={32}
      footer={
        <>
          {resolve.isError && <p className="mr-auto self-center text-body-sm text-error">{resolve.error.message}</p>}
          <div className="flex gap-sm">
            <Button
              loading={resolve.isPending}
              disabled={!canSubmit}
              onClick={() =>
                canSubmit &&
                resolve.mutate(
                  { id: dispute.id, action: action as DisputeAction, resolutionNote: note.trim() },
                  { onSuccess: onClose },
                )
              }
            >
              Resolve
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="flex flex-col gap-sm">
          {DISPUTE_ACTIONS.map((a) => (
            <Card
              key={a.value}
              onClick={() => setAction(a.value)}
              className={`cursor-pointer ${action === a.value ? 'ring-2 ring-primary' : ''}`}
            >
              <p className="text-body font-medium text-text-primary">{a.label}</p>
              <p className="text-caption text-text-secondary">{a.detail}</p>
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="dispute-note">
            What was decided, and why
          </label>
          <textarea
            id="dispute-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Who you spoke to, what they said, what you decided."
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          />
          {/* Required by the server, not merely encouraged. Mediation happens off the platform,
              so this note is the only part of the decision the record ever gets — and this is the
              one decision here with real legal exposure. */}
          <p className="text-caption text-text-secondary">
            Required. The conversation happened off Sentpo; this is the only record of it.
          </p>
        </div>
      </div>
    </Modal>
  )
}
