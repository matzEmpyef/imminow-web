import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { FilterChip } from '@/components/FilterChip'
import { Modal } from '@/components/Modal'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { relativeTime } from '@/lib/time'
import { showToast } from '@/lib/toast'
import {
  useServiceFollowups,
  useServiceNotes,
  useRecordServiceNote,
  useSendNudge,
  type ServiceFollowupOutcome,
  type ServiceFollowupRow,
} from '@/queries/serviceFollowups'
import { FollowupSummaryStrip } from './followups/FollowupSummaryStrip'
import { SignalBadges } from './followups/SignalBadges'
import { FollowupHistoryDrawer } from './followups/FollowupHistoryDrawer'
import { LogCallModal, type LogCallInput } from './followups/LogCallModal'
import { OUTCOME_LABELS, SERVICE_OUTCOME_OPTIONS, SERVICE_SIGNAL_LABELS } from './followups/labels'

// "1st half 2026" / "2nd half 2026" — this page's own short form of intended_intake +
// intended_year. Deliberately not lib/time's formatIntake ("Jan – Jun 2026"), which is the
// platform-wide convention for showing the field elsewhere; this page's spec calls for the
// ordinal form specifically, so it stays local rather than changing a shared helper for one page.
function intakeLabel(row: ServiceFollowupRow): string {
  if (!row.intended_intake) return '—'
  const half = row.intended_intake === 'first_half' ? '1st half' : '2nd half'
  return row.intended_year ? `${half} ${row.intended_year}` : half
}

// The row's most urgent signal decides which pitch a nudge opens with (2026-09-11 build spec).
function defaultNudgeMessage(row: ServiceFollowupRow): string {
  const code = row.signals[0]?.code
  if (code === 'no_consultancy_yet' || code === 'waiting_for_allocation') {
    const intake = intakeLabel(row)
    return intake === '—'
      ? 'Need help getting started? We can match you with a consultancy — tap to continue.'
      : `Need help getting started? We can match you with a consultancy for your ${intake} intake — tap to continue.`
  }
  if (code === 'lead_no_reply') {
    return `Still waiting to hear from ${row.consultancy_name ?? 'the consultancy'}? Tap and we'll help you get an answer.`
  }
  return 'How is your application going? Tap if you need a hand from the Sentpo team.'
}

function ProfileBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent))
  return (
    <div className="flex items-center gap-xs">
      <span className="tabular-nums text-caption text-text-secondary">{clamped}%</span>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-border">
        <div className="h-1 rounded-full bg-primary" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}

// The more recent of the last logged call and the last push — a student support has messaged
// today reads as "contacted" even if the last CALL was weeks ago.
function LastContactCell({ row }: { row: ServiceFollowupRow }) {
  const callAt = row.last_followup?.created_at
  const nudgeAt = row.last_nudge_at
  if (!callAt && !nudgeAt) return <span className="text-caption text-warning">Not called</span>
  if (nudgeAt && (!callAt || nudgeAt > callAt)) {
    return (
      <div className="flex flex-col gap-xs">
        <span className="flex items-center gap-xs text-caption text-text-secondary">
          <Bell className="h-3.5 w-3.5" aria-hidden />
          Push sent
        </span>
        <span className="text-caption text-text-secondary">{relativeTime(nudgeAt)}</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-caption text-text-secondary">{relativeTime(callAt!)}</span>
      {row.last_followup?.outcome && (
        <Badge color="info">{OUTCOME_LABELS[row.last_followup.outcome] ?? row.last_followup.outcome}</Badge>
      )}
    </div>
  )
}

function SendNudgeModal({ row, onClose }: { row: ServiceFollowupRow; onClose: () => void }) {
  const send = useSendNudge()
  const [title, setTitle] = useState('A message from Sentpo')
  const [body, setBody] = useState(() => defaultNudgeMessage(row))

  return (
    <Modal
      onClose={onClose}
      title={`Send a push — ${row.student_name}`}
      widthRem={32}
      footer={
        <>
          {send.isError && <p className="mr-auto self-center text-body-sm text-error">{send.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={send.isPending}
            disabled={!body.trim()}
            onClick={() =>
              send.mutate(
                { studentId: row.student_id, title: title.trim() || undefined, body: body.trim() },
                {
                  onSuccess: () => {
                    onClose()
                    showToast(`Push sent to ${row.student_name}`)
                  },
                },
              )
            }
          >
            Send
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <TextField label="Title" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-col gap-xs">
          <TextAreaField
            label="Message"
            required
            rows={4}
            maxLength={240}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="pl-lg text-caption text-text-secondary">{body.length}/240</p>
        </div>
        <div className="rounded-md border border-border bg-background p-md">
          <p className="text-caption font-medium text-text-secondary">Preview</p>
          <p className="text-body-sm font-semibold text-text-primary">{title.trim() || 'A message from Sentpo'}</p>
          <p className="text-body-sm text-text-secondary">{body.trim() || 'Your message preview appears here.'}</p>
        </div>
        <p className="text-caption text-text-secondary">
          Sends a push notification to the student&rsquo;s phone. One per student per day.
        </p>
      </div>
    </Modal>
  )
}

/**
 * Support's chase list — "Student follow-ups" (2026-09-11).
 *
 * Per STUDENT rather than per case: several signals fire before any consultancy exists at all
 * (no_consultancy_yet, waiting_for_allocation), which a case-based queue can never see. Two ways
 * to act — a logged call, or a push notification — because not every stuck student needs a phone
 * call; sometimes a nudge back into the app is enough.
 */
export function ServiceFollowupsPage() {
  const [includeSnoozed, setIncludeSnoozed] = useState(false)
  const queue = useServiceFollowups(includeSnoozed)
  const [search, setSearch] = useState('')
  const [signalFilter, setSignalFilter] = useState('')
  const [notCalledOnly, setNotCalledOnly] = useState(false)
  const [dueOnly, setDueOnly] = useState(false)
  const [viewing, setViewing] = useState<ServiceFollowupRow | null>(null)
  const [logging, setLogging] = useState<ServiceFollowupRow | null>(null)
  const [nudging, setNudging] = useState<ServiceFollowupRow | null>(null)

  const items = useMemo(() => queue.data?.items ?? [], [queue.data])
  const summary = queue.data?.summary

  const signalOptions = useMemo(
    () =>
      Object.entries(summary?.by_signal ?? {})
        .filter(([, count]) => count > 0)
        .map(([code, count]) => ({ code, count, label: SERVICE_SIGNAL_LABELS[code] ?? code })),
    [summary],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((row) => {
      if (q) {
        const hay = `${row.student_name} ${row.email ?? ''} ${row.consultancy_name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (signalFilter && !row.signals.some((s) => s.code === signalFilter)) return false
      if (notCalledOnly && row.followup_count > 0) return false
      if (dueOnly && !row.due_for_call) return false
      return true
    })
  }, [items, search, signalFilter, notCalledOnly, dueOnly])

  const notes = useServiceNotes(viewing?.student_id ?? null)
  const record = useRecordServiceNote()

  function handleSave(row: ServiceFollowupRow, input: LogCallInput) {
    record.mutate(
      {
        studentId: row.student_id,
        note: input.note,
        outcome: input.outcome as ServiceFollowupOutcome | undefined,
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

  const columns: TableColumn<ServiceFollowupRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.student_name}</span>
          <span className="text-caption text-text-secondary">{row.email ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'signals',
      header: 'Signal(s)',
      render: (row) => <SignalBadges signals={row.signals} />,
    },
    {
      key: 'intake',
      header: 'Intake',
      hideBelow: 'lg',
      render: (row) => <span className="text-text-secondary">{intakeLabel(row)}</span>,
    },
    {
      key: 'profile',
      header: 'Profile',
      hideBelow: 'md',
      render: (row) => <ProfileBar percent={row.profile_completion_percent ?? 0} />,
    },
    {
      key: 'consultancy',
      header: 'Consultancy',
      hideBelow: 'md',
      render: (row) =>
        row.consultancy_name ? (
          <span className="text-text-primary">{row.consultancy_name}</span>
        ) : (
          <span className="text-caption text-warning">None yet</span>
        ),
    },
    {
      key: 'waiting',
      header: 'Waiting',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => <span className="tabular-nums text-text-secondary">{row.days_waiting} days</span>,
    },
    {
      key: 'last_contact',
      header: 'Last contact',
      render: (row) => <LastContactCell row={row} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <StopPropagation>
          {/* Stacked, not side by side (2026-09-11): in a row the pair pushed the table 29px past
              its card at 1280px, so the last column scrolled out of view. */}
          <div className="flex flex-col items-end gap-xs">
            <Button size="sm" variant="secondary" onClick={() => setLogging(row)}>
              Log a call
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setNudging(row)}>
              Send a push
            </Button>
          </div>
        </StopPropagation>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Student follow-ups</h1>
          <p className="text-body-sm text-text-secondary">
            Students who are stuck — no consultancy yet, no reply, no plan, or stalled. Call or send a push, then log
            what happened.
          </p>
        </div>

        <FollowupSummaryStrip
          summary={summary}
          loading={queue.isLoading}
          totalLabel="Students"
          notCalledActive={notCalledOnly}
          onToggleNotCalled={() => setNotCalledOnly((v) => !v)}
          dueActive={dueOnly}
          onToggleDue={() => setDueOnly((v) => !v)}
        />

        <Table
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.student_id}
          loading={queue.isLoading}
          error={queue.isError ? 'Could not load the follow-up queue.' : undefined}
          emptyMessage="Nothing needs chasing right now."
          onRowClick={(row) => setViewing(row)}
          search={{ value: search, onChange: setSearch, placeholder: 'Search student, email or consultancy…' }}
          filters={
            <CompactSelect value={signalFilter} onChange={(e) => setSignalFilter(e.target.value)} label="Signal">
              <option value="">Any signal</option>
              {signalOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label} ({o.count})
                </option>
              ))}
            </CompactSelect>
          }
          quickFilters={
            <>
              <FilterChip label="Not called yet" active={notCalledOnly} onChange={setNotCalledOnly} />
              <FilterChip label="Due for a call" active={dueOnly} onChange={setDueOnly} />
              <FilterChip label="Show snoozed" active={includeSnoozed} onChange={setIncludeSnoozed} />
            </>
          }
        />
      </div>

      <FollowupHistoryDrawer
        open={viewing != null}
        onClose={() => setViewing(null)}
        title={viewing?.student_name ?? ''}
        subtitle={viewing?.email}
        signals={viewing?.signals}
        details={
          viewing && (
            <div className="flex flex-wrap gap-md rounded-md bg-background px-md py-sm text-caption text-text-secondary">
              <span>Profile {viewing.profile_completion_percent ?? 0}% complete</span>
              <span>Intake {intakeLabel(viewing)}</span>
              <span>Waiting {viewing.days_waiting} days</span>
              <span>{viewing.consultancy_name ?? 'No consultancy yet'}</span>
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
              <Button size="sm" variant="secondary" onClick={() => setNudging(viewing)}>
                Send a push
              </Button>
              {viewing.journey_id ? (
                <Link
                  to={`/admin/applicants/${viewing.journey_id}`}
                  className="flex h-8 items-center justify-center rounded-full border border-border bg-surface px-3 text-caption font-medium text-text-primary hover:bg-background"
                >
                  Open case
                </Link>
              ) : (
                <Link
                  to={`/admin/users/sentpo?search=${encodeURIComponent(viewing.email ?? '')}`}
                  className="flex h-8 items-center justify-center rounded-full border border-border bg-surface px-3 text-caption font-medium text-text-primary hover:bg-background"
                >
                  Open in Sentpo Users
                </Link>
              )}
            </>
          )
        }
      />

      {logging && (
        <LogCallModal
          title={`Log a call — ${logging.student_name}`}
          outcomeOptions={SERVICE_OUTCOME_OPTIONS}
          pending={record.isPending}
          errorMessage={record.isError ? record.error.message : undefined}
          onClose={() => setLogging(null)}
          onSave={(input) => handleSave(logging, input)}
        />
      )}

      {nudging && <SendNudgeModal row={nudging} onClose={() => setNudging(null)} />}
    </AdminShell>
  )
}
