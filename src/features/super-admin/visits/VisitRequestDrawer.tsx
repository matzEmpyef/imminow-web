import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { formatDate, formatDateTime, relativeTime } from '@/lib/time'
import { useNudgeVisitRequest, type VisitRequest } from '@/queries/visitRequests'
import { waitingLabel } from './format'

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000

/**
 * The full visit request record (2026-09-12 build) — the proposed slot, how to reach the student
 * and the consultancy side, how long it's been waiting, the reminder history, and the one action
 * available: nudging the consultancy. There is nothing to set here beyond that reminder — the
 * consultancy replying in the actual chat thread is what resolves this, and Support can't read
 * that chat, only see whether it's happened.
 */
export function VisitRequestDrawer({
  request,
  onClose,
  onUpdated,
}: {
  request: VisitRequest
  onClose: () => void
  onUpdated: (updated: VisitRequest) => void
}) {
  const nudge = useNudgeVisitRequest()
  const waiting = waitingLabel(request.waiting_hours)

  const cooldownUntil = request.last_nudged_at ? new Date(request.last_nudged_at).getTime() + NUDGE_COOLDOWN_MS : null
  const inCooldown = cooldownUntil != null && Date.now() < cooldownUntil

  const disabledReason = request.responded
    ? 'The consultancy already replied in this chat — no reminder needed.'
    : inCooldown
      ? `Already reminded — can send another after ${formatDateTime(new Date(cooldownUntil!))}.`
      : undefined

  return (
    <Drawer open onClose={onClose} title={request.context.name} dismissible>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-wrap items-center gap-sm">
          <span className="font-medium text-text-primary">{request.context.name}</span>
          <Badge color="secondary" className="capitalize">
            {request.context.kind}
          </Badge>
          <Badge color={request.responded ? 'success' : 'warning'}>{request.responded ? 'Replied' : 'Pending'}</Badge>
        </div>

        {/* Visit request */}
        <div className="flex flex-col gap-xs">
          <p className="text-caption font-medium text-text-secondary">Requested visit</p>
          <p className="text-body-sm text-text-primary">
            {formatDate(request.proposed_date)} at {request.proposed_time}
          </p>
          {request.note && (
            <p className="whitespace-pre-wrap rounded-md bg-background p-sm text-body-sm text-text-primary">
              {request.note}
            </p>
          )}
          <p className="text-caption text-text-secondary">Requested {formatDateTime(request.created_at)}</p>
        </div>

        {/* Student */}
        <div className="flex flex-col gap-xs">
          <p className="text-caption font-medium text-text-secondary">Student</p>
          <p className="text-body-sm text-text-primary">{request.context.name}</p>
          <div className="flex flex-col gap-xs text-body-sm">
            {request.student_email && (
              <a href={`mailto:${request.student_email}`} className="text-primary hover:underline">
                {request.student_email}
              </a>
            )}
            {request.student_phone && (
              <a href={`tel:${request.student_phone}`} className="text-primary hover:underline">
                {request.student_phone}
              </a>
            )}
            {!request.student_email && !request.student_phone && <span className="text-text-secondary">—</span>}
          </div>
        </div>

        {/* Consultancy */}
        <div className="flex flex-col gap-xs">
          <p className="text-caption font-medium text-text-secondary">Consultancy</p>
          <p className="text-body-sm text-text-primary">{request.consultancy_name}</p>
          {request.consultancy_contact && (
            <div className="flex flex-col gap-xs rounded-md bg-background p-sm">
              <div className="flex flex-wrap items-center gap-sm">
                {request.consultancy_contact.name && (
                  <span className="text-body-sm font-medium text-text-primary">{request.consultancy_contact.name}</span>
                )}
                <Badge color="info">
                  {request.consultancy_contact.assigned ? 'Assigned consultant' : 'Consultancy admin'}
                </Badge>
              </div>
              <div className="flex flex-col gap-xs">
                {request.consultancy_contact.email && (
                  <a
                    href={`mailto:${request.consultancy_contact.email}`}
                    className="text-caption text-primary hover:underline"
                  >
                    {request.consultancy_contact.email}
                  </a>
                )}
                {request.consultancy_contact.phone && (
                  <a href={`tel:${request.consultancy_contact.phone}`} className="text-caption text-primary hover:underline">
                    {request.consultancy_contact.phone}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Waiting + reminders */}
        <div className="grid grid-cols-2 gap-sm">
          <div className="flex flex-col gap-xs rounded-md border border-border p-sm">
            <p className="text-caption font-medium text-text-secondary">Waiting</p>
            <p className={`text-body-sm ${waiting.warn ? 'font-medium text-warning' : 'text-text-primary'}`}>
              {waiting.text}
            </p>
          </div>
          <div className="flex flex-col gap-xs rounded-md border border-border p-sm">
            <p className="text-caption font-medium text-text-secondary">Reminders</p>
            <p className="text-body-sm text-text-primary">
              {request.nudge_count
                ? `Reminded ${request.nudge_count} time${request.nudge_count === 1 ? '' : 's'}, last ${relativeTime(request.last_nudged_at!)}`
                : 'Not reminded yet'}
            </p>
          </div>
        </div>

        <p className="text-caption text-text-secondary">
          Support can't read this conversation — only whether the consultancy has replied. Scheduling itself happens
          in the chat between the student and the consultancy.
        </p>

        {/* Action */}
        <div className="flex flex-col gap-xs border-t border-border pt-md">
          <Button
            disabled={Boolean(disabledReason)}
            loading={nudge.isPending}
            onClick={() =>
              nudge.mutate(request.id, { onSuccess: (updated) => updated && onUpdated(updated) })
            }
          >
            Remind the consultancy
          </Button>
          {disabledReason && <p className="text-caption text-text-secondary">{disabledReason}</p>}
          {nudge.isError && <p className="text-caption text-error">{nudge.error.message}</p>}
        </div>
      </div>
    </Drawer>
  )
}
