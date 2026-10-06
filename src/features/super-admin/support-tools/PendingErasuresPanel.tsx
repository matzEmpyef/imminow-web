import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { ContactLink } from '@/components/CopyButton'
import { Table, type TableColumn } from '@/components/Table'
import { Toggle } from '@/components/Toggle'
import { humaniseCode, labelFor } from '@/lib/humanise'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import { useIsSuperAdmin } from '@/lib/me'
import { useErasures, type ErasureListStatus, type ErasureRequest } from '@/queries/supportTools'
import { CancelErasureModal } from './CancelErasureModal'

const STATUS_META: Record<ErasureRequest['status'], { label: string; color: 'warning' | 'info' | 'secondary' | 'success' }> = {
  pending: { label: 'Scheduled', color: 'warning' },
  queued: { label: 'Erasing', color: 'info' },
  processing: { label: 'Erasing', color: 'info' },
  completed: { label: 'Erased', color: 'secondary' },
  cancelled: { label: 'Kept', color: 'success' },
}

const ROLE_LABEL: Record<string, string> = {
  student: 'Student',
  consultancy_admin: 'Consultancy admin',
  consultant: 'Consultant',
  platform_staff: 'Platform staff',
  freelancer: 'Freelancer',
}

/**
 * Scheduled erasures (gate 12f, owner decision 20), on the Support Tools page: every account that
 * is locked and waiting out its 30 days, soonest first, so "who is about to be erased" is one
 * glance rather than a search per person. Anyone with Support Tools can read it; only a Super
 * Admin can keep an account, which is the server's rule and the reason the button is theirs alone.
 *
 * "Recently ended" switches to the erasures completed or cancelled in the last 90 days.
 */
export function PendingErasuresPanel() {
  const isSuperAdmin = useIsSuperAdmin()
  const [status, setStatus] = useState<ErasureListStatus>('pending')
  const paging = useCursorPagination()
  const erasures = useErasures(status, paging.cursor, 10)
  const [cancelling, setCancelling] = useState<ErasureRequest | null>(null)

  const rows = erasures.data?.items ?? []
  const nextCursor = erasures.data?.meta.next_cursor
  const ended = status === 'ended'

  const columns: TableColumn<ErasureRequest>[] = [
    {
      key: 'name',
      header: 'Account',
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{e.name}</p>
          {(e.email || e.phone) && (
            <p className="flex flex-wrap items-center gap-x-sm text-caption text-text-secondary">
              {e.email && <ContactLink kind="email" value={e.email} />}
              {e.phone && <ContactLink kind="phone" value={e.phone} />}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      hideBelow: 'sm',
      render: (e) => (
        <div className="flex flex-col">
          <span className="text-text-primary">{labelFor(ROLE_LABEL, e.role)}</span>
          {e.consultancy_name && <span className="text-caption text-text-secondary">{e.consultancy_name}</span>}
        </div>
      ),
    },
    {
      key: 'requested',
      header: 'Requested',
      hideBelow: 'md',
      render: (e) => (
        <div className="flex flex-col">
          <span className="whitespace-nowrap text-text-primary">{formatDate(e.requested_at)}</span>
          <span className="text-caption text-text-secondary">
            {e.requested_by === 'self'
              ? 'by the account holder'
              : e.requested_by === 'support'
                ? `by ${e.requested_by_name ?? 'Support'}`
                : humaniseCode(e.requested_by)}
          </span>
        </div>
      ),
    },
    {
      key: 'due',
      header: ended ? 'Ended' : 'Erases on',
      render: (e) => {
        const endedAt = e.cancelled_at ?? e.completed_at
        return (
          <div className="flex flex-col">
            <span className="whitespace-nowrap text-text-primary">
              {ended && endedAt ? formatDate(endedAt) : formatDate(e.due_at)}
            </span>
            {e.immediate && <span className="text-caption text-error">Immediate (legal request)</span>}
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => {
        const meta = STATUS_META[e.status]
        return <Badge color={meta?.color ?? 'secondary'}>{meta?.label ?? humaniseCode(e.status)}</Badge>
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) =>
        // Only while it can still be kept: once the erasing has started the server refuses.
        isSuperAdmin && e.status === 'pending' ? (
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => setCancelling(e)}>
              Cancel
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <section aria-labelledby="pending-erasures-heading" className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h2 id="pending-erasures-heading" className="text-h2 text-text-primary">
            {ended ? 'Recently ended erasures' : 'Pending erasures'}
          </h2>
          <p className="text-body-sm text-text-secondary">
            {ended
              ? 'Erasures completed or cancelled in the last 90 days.'
              : 'Accounts that are locked now and will be erased on the date shown. Until then an account can be kept.'}
            {!isSuperAdmin && !ended && ' Only a Super Admin can cancel one.'}
          </p>
        </div>
        <label htmlFor="erasures-ended" className="flex cursor-pointer items-center gap-sm text-body-sm text-text-secondary">
          <Toggle
            id="erasures-ended"
            size="sm"
            label="Recently ended"
            checked={ended}
            onChange={(checked) => {
              setStatus(checked ? 'ended' : 'pending')
              paging.reset()
            }}
          />
          Recently ended
        </label>
      </div>

      <Table
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        loading={erasures.isLoading}
        error={erasures.isError ? erasures.error.message : undefined} errorSource={erasures.error}
        emptyMessage={ended ? 'No erasures ended in the last 90 days.' : 'No erasures are scheduled.'}
        pagination={{
          hasNext: Boolean(nextCursor),
          hasPrevious: paging.hasPrevious,
          onNext: () => nextCursor && paging.next(nextCursor),
          onPrevious: paging.previous,
          total: erasures.data?.meta.total,
          totalCapped: erasures.data?.meta.total_capped,
        }}
      />

      {cancelling && (
        <CancelErasureModal
          userId={cancelling.user_id}
          name={cancelling.name}
          dueAt={cancelling.due_at}
          onClose={() => setCancelling(null)}
        />
      )}
    </section>
  )
}
