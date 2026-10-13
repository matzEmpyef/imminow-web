import { inr } from '@/lib/money'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { FilterChip } from '@/components/FilterChip'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { relativeTime, formatDate } from '@/lib/time'
import { cursorPager, useCursorPagination } from '@/lib/pagination'
import { showToast } from '@/lib/toast'
import { useCaseFollowups, useCaseNotes, useRecordFollowup, type CaseFollowupOutcome, type CaseFollowupRow } from '@/queries/caseFollowups'
import { FollowupSummaryStrip } from './followups/FollowupSummaryStrip'
import { SignalBadges } from './followups/SignalBadges'
import { FollowupHistoryDrawer } from './followups/FollowupHistoryDrawer'
import { LogCallModal, type LogCallInput } from './followups/LogCallModal'
import { CASE_OUTCOME_OPTIONS, CASE_SIGNAL_LABELS, OUTCOME_LABELS } from './followups/labels'
import { signalOptions, useFollowupFilters } from './followups/useFollowupFilters'
import { ConsultancySearchSelect } from './finance/ConsultancySearchSelect'

/**
 * Finance's chase list — "Payment follow-ups" (2026-09-11, replacing the earlier one-queue
 * CaseFollowupsPage now that the service signals moved to their own ServiceFollowupsPage).
 *
 * Closing a case is a consultancy action, and closing is what makes the commission due — so a
 * consultancy controls when it owes the platform money. The contract enforces the obligation;
 * this page is how the platform notices when it hasn't happened.
 *
 * Nothing on this page closes, recognises or reverses anything, and that is deliberate: an
 * auto-close would move money on a case nobody looked at. Working this queue is a phone call.
 */
export function CaseFollowupsPage() {
  const paging = useCursorPagination()
  // Search and filters go to the server, which applies them over the whole queue and counts the
  // summary tiles over the same rows (review F-154). They used to narrow only the page on screen.
  const { filters, set: setFilter, narrowed } = useFollowupFilters(paging)
  const queue = useCaseFollowups(filters, paging.cursor)
  const [viewing, setViewing] = useState<CaseFollowupRow | null>(null)
  const [logging, setLogging] = useState<CaseFollowupRow | null>(null)

  const summary = queue.data?.summary
  // No `meta` = the frozen mock / an unpaged server: every row is here already, no pager.
  const pager = cursorPager(paging, queue.data?.meta)

  const notes = useCaseNotes(viewing?.journey_id ?? null)
  const record = useRecordFollowup()

  function handleSave(row: CaseFollowupRow, input: LogCallInput) {
    if (!row.journey_id) return
    record.mutate(
      {
        journeyId: row.journey_id,
        note: input.note,
        outcome: input.outcome as CaseFollowupOutcome | undefined,
        callBackOn: input.callBackOn,
      },
      {
        onSuccess: () => {
          setLogging(null)
          showToast(`Call logged for ${row.student_name}`)
        },
      },
    )
  }

  const columns: TableColumn<CaseFollowupRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.student_name}</span>
          <span className="text-caption text-text-secondary">{row.consultancy_name ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'signals',
      header: 'Signal(s)',
      render: (row) => <SignalBadges signals={row.signals} />,
    },
    {
      key: 'amount',
      header: '₹ pending',
      align: 'right',
      render: (row) =>
        (row.pending_inr ?? 0) > 0 ? (
          <span className="tabular-nums">{inr(row.pending_inr ?? 0)}</span>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      key: 'idle',
      header: 'Idle',
      align: 'right',
      hideBelow: 'md',
      render: (row) => (
        <span className="tabular-nums text-text-secondary">
          {row.days_since_last_status_change != null ? `${row.days_since_last_status_change}d` : '—'}
        </span>
      ),
    },
    {
      key: 'last_call',
      header: 'Last call',
      hideBelow: 'sm',
      render: (row) =>
        row.last_followup ? (
          <div className="flex flex-col gap-xs">
            <span className="text-caption text-text-secondary">{relativeTime(row.last_followup.created_at)}</span>
            {row.last_followup.outcome && (
              <Badge color="info">{OUTCOME_LABELS[row.last_followup.outcome] ?? row.last_followup.outcome}</Badge>
            )}
          </div>
        ) : (
          <span className="text-caption text-warning">Not called</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.due_for_call ? (
          <Badge color="warning">Due for a call</Badge>
        ) : row.snoozed_until ? (
          <span className="text-caption text-text-secondary">Snoozed until {formatDate(row.snoozed_until)}</span>
        ) : (
          <span className="text-caption text-text-secondary">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <StopPropagation>
          <Button size="sm" variant="secondary" onClick={() => setLogging(row)}>
            Log a call
          </Button>
        </StopPropagation>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Payment follow-ups</h1>
          <p className="text-body-sm text-text-secondary">
            Cases where the commission should have become due and hasn&rsquo;t. Nothing here closes anything — call
            the consultancy and log what they said.
          </p>
        </div>

        <FollowupSummaryStrip
          summary={summary}
          loading={queue.isLoading}
          totalLabel="Cases"
          showPendingInr
          notCalledActive={Boolean(filters.notCalled)}
          onToggleNotCalled={() => setFilter({ notCalled: !filters.notCalled })}
          dueActive={Boolean(filters.dueForCall)}
          onToggleDue={() => setFilter({ dueForCall: !filters.dueForCall })}
        />

        <Table
          columns={columns}
          rows={queue.data?.items ?? []}
          rowKey={(row) => row.journey_id ?? row.student_id ?? row.student_name ?? ''}
          loading={queue.isLoading}
          error={queue.isError ? 'Could not load the follow-up queue.' : undefined} errorSource={queue.error}
          emptyMessage={narrowed ? 'No cases match these filters.' : 'Nothing needs chasing right now.'}
          onRowClick={(row) => setViewing(row)}
          search={{
            value: filters.search ?? '',
            onChange: (value) => setFilter({ search: value }),
            placeholder: 'Search student or consultancy…',
          }}
          pagination={pager}
          filters={
            <>
              <CompactSelect
                value={filters.signal ?? ''}
                onChange={(e) => setFilter({ signal: e.target.value })}
                label="Signal"
              >
                <option value="">Any signal</option>
                {signalOptions(CASE_SIGNAL_LABELS, summary, filters.signal).map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </CompactSelect>
              {/* Any consultancy, found on the server: the list used to offer only the names on
                  the page being shown. */}
              <div className="w-56">
                <ConsultancySearchSelect
                  value={filters.consultancyId ?? ''}
                  onChange={(id) => setFilter({ consultancyId: id })}
                />
              </div>
            </>
          }
          quickFilters={
            <>
              <FilterChip
                label="Not called yet"
                active={Boolean(filters.notCalled)}
                onChange={(v) => setFilter({ notCalled: v })}
              />
              <FilterChip
                label="Due for a call"
                active={Boolean(filters.dueForCall)}
                onChange={(v) => setFilter({ dueForCall: v })}
              />
              <FilterChip
                label="Show snoozed"
                active={Boolean(filters.includeSnoozed)}
                onChange={(v) => setFilter({ includeSnoozed: v })}
              />
            </>
          }
        />
      </div>

      <FollowupHistoryDrawer
        open={viewing != null}
        onClose={() => setViewing(null)}
        title={viewing?.student_name ?? ''}
        subtitle={viewing?.consultancy_name}
        signals={viewing?.signals}
        details={
          viewing && (
            <div className="flex flex-wrap gap-md rounded-md bg-background px-md py-sm text-caption text-text-secondary">
              <span>{viewing.days_since_started ?? '—'} days running</span>
              <span>{viewing.days_since_last_status_change ?? '—'} days since anything moved</span>
              <span>
                {viewing.case_progress?.plan_progress ?? 'No plan'}
                {(viewing.case_progress?.plan_count ?? 0) > 1 && ` across ${viewing.case_progress?.plan_count} plans`}
              </span>
              <span>{viewing.case_progress?.application_total ?? 0} applications</span>
              <span>{viewing.case_progress?.offers ?? 0} offers</span>
            </div>
          )
        }
        notes={notes.data}
        notesLoading={notes.isLoading}
        notesError={notes.isError}
        onRetryNotes={() => notes.refetch()}
        actions={
          viewing && (
            <>
              <Button size="sm" onClick={() => setLogging(viewing)}>
                Log a call
              </Button>
              {viewing.journey_id && (
                <Link
                  to={`/admin/case-followups/${viewing.journey_id}`}
                  className="flex h-8 items-center justify-center rounded-full border border-border bg-surface px-3 text-caption font-medium text-text-primary hover:bg-background"
                >
                  Open case
                </Link>
              )}
            </>
          )
        }
      />

      {logging && (
        <LogCallModal
          title={`Log a call — ${logging.student_name}`}
          outcomeOptions={CASE_OUTCOME_OPTIONS}
          pending={record.isPending}
          errorMessage={record.isError ? record.error.message : undefined}
          onClose={() => setLogging(null)}
          onSave={(input) => handleSave(logging, input)}
        />
      )}
    </AdminShell>
  )
}
