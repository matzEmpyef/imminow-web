import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { FilterChip } from '@/components/FilterChip'
import { Table, type TableColumn } from '@/components/Table'
import { CancelProposalModal } from '@/features/sales/CancelProposalModal'
import { useApplicantRequests, type ApplicantRequest, type ApplicantRequestView } from '@/queries/applicantRequests'
import { requestStatusLabel } from '@/lib/applicantRequestWords'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'

// Short pages: this sits above the Clients table and must not push it off the screen.
const PAGE_SIZE = 5

const CASE_TYPE_LABEL: Record<ApplicantRequest['case_type'], string> = { student: 'Student', pr: 'PR' }

/** The name the staff member typed. Null once the account was erased: the typed details went with it. */
function typedName(request: ApplicantRequest): string | null {
  return request.requested ? `${request.requested.first_name} ${request.requested.last_name}`.trim() : null
}

function CancelRequestTrigger({ request, onCancelled }: { request: ApplicantRequest; onCancelled: () => void }) {
  const [open, setOpen] = useState(false)
  const name = typedName(request)
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={name ? `Cancel request to ${name}` : 'Cancel request'}
      >
        Cancel request
      </Button>
      {open && (
        <CancelProposalModal
          proposalId={request.id}
          title="Cancel request"
          confirmLabel="Cancel request"
          keepLabel="Keep request"
          doneMessage="Request cancelled"
          refusedMessage="You can't cancel this request."
          onClose={() => setOpen(false)}
          onCancelled={onCancelled}
        >
          Cancel this request? {name ?? 'This person'} will no longer be able to accept it. You can ask again after 24
          hours.
        </CancelProposalModal>
      )}
    </>
  )
}

/**
 * Create Applicant requests to people who already have a Sentpo account (owner decisions 1 and 25,
 * contract gate 12f). Until the student accepts in the app there is no client, so these are not
 * rows of the Clients table; they sit above it. Every cell is something this consultancy's own
 * staff typed or chose — the server sends nothing from the account, and nothing is added here.
 *
 * Renders nothing for a consultancy that has no waiting and no recently ended request, which is
 * most of them most of the time.
 */
export function ApplicantRequestsPanel() {
  const [view, setView] = useState<ApplicantRequestView>('pending')
  const pendingPaging = useCursorPagination()
  const endedPaging = useCursorPagination()
  const paging = view === 'pending' ? pendingPaging : endedPaging

  // The first page of each view decides whether the panel shows at all; the view on screen reuses
  // the same query while it is on its first page.
  const firstPending = useApplicantRequests({ status: 'pending', limit: PAGE_SIZE })
  const firstEnded = useApplicantRequests({ status: 'ended', limit: PAGE_SIZE })
  const current = useApplicantRequests({ status: view, cursor: paging.cursor, limit: PAGE_SIZE })

  const hasAny = (firstPending.data?.items.length ?? 0) > 0 || (firstEnded.data?.items.length ?? 0) > 0
  if (!hasAny) return null

  const waiting = view === 'pending'
  const columns: TableColumn<ApplicantRequest>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (request) => <span className="font-medium text-text-primary">{typedName(request) ?? '—'}</span>,
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (request) =>
        request.requested ? (
          <div className="flex flex-col">
            <span className="text-text-secondary">{request.requested.email}</span>
            <span className="text-text-secondary">{request.requested.phone ?? '—'}</span>
          </div>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      key: 'case_type',
      header: 'Applicant type',
      render: (request) => <span className="text-text-secondary">{CASE_TYPE_LABEL[request.case_type]}</span>,
    },
    {
      key: 'assigned',
      header: 'Assigned to',
      render: (request) => <span className="text-text-secondary">{request.assigned_employee_name ?? '—'}</span>,
    },
    {
      key: 'sent_at',
      header: 'Sent',
      render: (request) => <span className="text-text-secondary">{formatDate(request.sent_at)}</span>,
    },
    waiting
      ? {
          key: 'expires_at',
          header: 'Expires',
          render: (request) => <span className="text-text-secondary">{formatDate(request.expires_at)}</span>,
        }
      : {
          key: 'status',
          header: 'Status',
          render: (request) => {
            // A row with no typed details reads "Expired" and links nowhere (applicantRequestWords).
            const accepted = request.status === 'approved' && Boolean(request.requested)
            return (
              <div className="flex items-center gap-sm">
                <Badge color={accepted ? 'success' : 'secondary'}>{requestStatusLabel(request)}</Badge>
                {accepted && request.client_id && (
                  <Link to={`/clients/${request.client_id}`} className="font-medium text-primary hover:underline">
                    View client
                  </Link>
                )}
              </div>
            )
          },
        },
    ...(waiting
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right',
            // The server lets the sender, the chosen consultant and an admin cancel. A row does not
            // say who sent it in a way that can be matched to the viewer, so the button is always
            // offered and a refusal (404) is answered in the confirm.
            //
            // Checked again against the merged contract on 2026-10-06 (gate 12f): the row still
            // carries `created_by_name` only, no sender id. `GET /me` now gives the viewer's own
            // employee id and whether they are the admin, and the row gives the chosen consultant,
            // but without the sender's id "may this person cancel" cannot be answered here for
            // everyone, and hiding the button from a sender would take away something they may do.
            // It stays as it is until the row carries the sender's id.
            render: (request: ApplicantRequest) => (
              <CancelRequestTrigger request={request} onCancelled={pendingPaging.reset} />
            ),
          } satisfies TableColumn<ApplicantRequest>,
        ]
      : []),
  ]

  return (
    <section aria-labelledby="applicant-requests-heading" className="overflow-hidden rounded-lg bg-surface p-xl shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-md px-md pb-sm">
        <div className="flex flex-col gap-xs">
          <h2 id="applicant-requests-heading" className="text-h2 text-text-primary">
            {waiting ? 'Waiting for the student to accept' : 'Recently ended requests'}
          </h2>
          <p className="text-body-sm text-text-secondary">
            People you added who already have a Sentpo account. These are the details you entered; nothing from their
            account is shown until they accept in the app.
          </p>
        </div>
        <FilterChip label="Recently ended" active={!waiting} onChange={(ended) => setView(ended ? 'ended' : 'pending')} />
      </div>
      <Table
        bare
        columns={columns}
        rows={current.data?.items ?? []}
        rowKey={(request) => request.id}
        loading={current.isLoading}
        error={current.isError ? 'Could not load the requests.' : undefined}
        emptyMessage={waiting ? 'No requests are waiting for a student to accept.' : 'No requests have ended recently.'}
        pagination={{
          hasNext: Boolean(current.data?.meta.next_cursor),
          hasPrevious: paging.hasPrevious,
          onNext: () => current.data?.meta.next_cursor && paging.next(current.data.meta.next_cursor),
          onPrevious: paging.previous,
          total: current.data?.meta.total,
        }}
      />
    </section>
  )
}
