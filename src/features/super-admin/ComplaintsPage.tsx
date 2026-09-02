import { useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { useAdminComplaints, useUpdateComplaint } from '@/queries/complaints'
import { formatDateTime } from '@/lib/time'
import type { components } from '@/api/schema'

type Complaint = components['schemas']['Complaint']

const CATEGORY_LABELS: Record<string, string> = {
  consultancy_dispute: 'Consultancy dispute',
  payment_issue: 'Payment issue',
  app_problem: 'App problem',
  other: 'Other',
}

const STATUS_META: Record<string, { label: string; color: 'warning' | 'info' | 'success' }> = {
  open: { label: 'Open', color: 'warning' },
  in_review: { label: 'In review', color: 'info' },
  resolved: { label: 'Resolved', color: 'success' },
}

// Detail + workflow popup: open → in_review is one click; resolving demands a resolution note
// (mirrors the server's own validation), same mandatory-reason convention as every other
// state-changing admin action.
function ComplaintDetailModal({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
  const update = useUpdateComplaint(complaint.id)
  const [resolutionNote, setResolutionNote] = useState('')

  return (
    <Modal
      onClose={onClose}
      title="Complaint"
      widthRem={32}
      footer={
        <>
          {update.isError && <p className="mr-auto self-center text-body-sm text-error">{update.error.message}</p>}
          <div className="flex gap-sm">
            {complaint.status === 'open' && (
              <Button
                variant="secondary"
                loading={update.isPending}
                onClick={() => update.mutate({ status: 'in_review' })}
              >
                Mark In Review
              </Button>
            )}
            {complaint.status !== 'resolved' && (
              <Button
                loading={update.isPending}
                disabled={!resolutionNote.trim()}
                onClick={() =>
                  update.mutate({ status: 'resolved', resolution_note: resolutionNote.trim() }, { onSuccess: onClose })
                }
              >
                Resolve
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center gap-sm">
          <span className="font-medium text-text-primary">{complaint.student_name}</span>
          <span className="text-body-sm text-text-secondary">{complaint.email}</span>
          <Badge color={STATUS_META[complaint.status]?.color ?? 'info'}>
            {STATUS_META[complaint.status]?.label ?? complaint.status}
          </Badge>
        </div>
        <dl className="flex flex-col gap-xs text-body-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Category</dt>
            <dd className="text-text-primary">{CATEGORY_LABELS[complaint.category] ?? complaint.category}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Consultancy</dt>
            <dd className="text-text-primary">{complaint.consultancy_name ?? '— (no active case)'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Submitted</dt>
            <dd className="text-text-primary">{formatDateTime(complaint.created_at)}</dd>
          </div>
        </dl>
        <div>
          <h2 className="text-body-sm font-medium text-text-primary">Description</h2>
          <p className="mt-xs whitespace-pre-wrap rounded-md bg-background p-sm text-body-sm text-text-primary">
            {complaint.description}
          </p>
        </div>
        {complaint.status === 'resolved' ? (
          <div>
            <h2 className="text-body-sm font-medium text-text-primary">Resolution</h2>
            <p className="mt-xs text-body-sm text-text-secondary">{complaint.resolution_note}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-xs">
            <label className="text-body-sm font-medium text-text-primary" htmlFor="resolution-note">
              Resolution note (required to resolve)
            </label>
            <textarea
              id="resolution-note"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
              placeholder="What was done about this complaint?"
              className="rounded-md border border-border bg-surface px-3 py-sm text-body"
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

const STATUS_FILTERS = [
  { value: null, label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' },
  { value: 'resolved', label: 'Resolved' },
] as const

export function ComplaintsPage() {
  const [statusFilter, setStatusFilter] = useState<string | null>('open')
  const complaints = useAdminComplaints(statusFilter)
  const [viewingId, setViewingId] = useState<string | null>(null)

  const columns: TableColumn<Complaint>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (c) => (
        <div>
          <button
            type="button"
            onClick={() => setViewingId(c.id)}
            className="text-left font-medium text-text-primary hover:text-primary hover:underline"
          >
            {c.student_name}
          </button>
          <p className="text-caption text-text-secondary">{c.email}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (c) => CATEGORY_LABELS[c.category] ?? c.category },
    { key: 'consultancy', header: 'Consultancy', render: (c) => c.consultancy_name ?? '—' },
    {
      key: 'description',
      header: 'Description',
      render: (c) => <span className="line-clamp-sm max-w-[24rem] text-text-secondary">{c.description}</span>,
    },
    { key: 'created_at', header: 'Submitted', render: (c) => formatDateTime(c.created_at) },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge color={STATUS_META[c.status]?.color ?? 'info'}>{STATUS_META[c.status]?.label ?? c.status}</Badge>
      ),
    },
  ]

  const viewing = complaints.data?.items.find((c) => c.id === viewingId)

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Complaints</h1>
          <p className="text-body-sm text-text-secondary">
            Dispute reports raised by students from the Sentpo app. The consultancy involved never sees these —
            resolution happens through the Sentpo team.
          </p>
        </div>

        <div className="flex gap-xs">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-body-sm ${
                statusFilter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-background text-text-secondary hover:text-text-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Table
          columns={columns}
          rows={complaints.data?.items ?? []}
          rowKey={(c) => c.id}
          loading={complaints.isLoading}
          error={complaints.isError ? 'Could not load complaints.' : undefined}
          emptyMessage={
            statusFilter
              ? `No ${STATUS_META[statusFilter]?.label.toLowerCase() ?? statusFilter} complaints.`
              : 'No complaints yet.'
          }
        />

        {viewing && <ComplaintDetailModal complaint={viewing} onClose={() => setViewingId(null)} />}
      </div>
    </AdminShell>
  )
}
