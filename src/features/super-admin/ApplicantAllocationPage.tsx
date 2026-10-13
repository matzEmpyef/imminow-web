import { useState } from 'react'
import { UserPlus, ShieldCheck } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { TextAreaField } from '@/components/TextAreaField'
import { CaseCarryFields } from '@/components/CaseCarryFields'
import { CompactSelect } from '@/components/CompactSelect'
import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect'
import { Table, type TableColumn } from '@/components/Table'
import {
  useApplicantAllocationQueue,
  useAllocateApplicant,
  useAllocationCandidates,
  useResolveAllocationRequest,
} from '@/queries/applicantAllocation'
import { formatDate } from '@/lib/time'
import { cursorPager, useCursorPagination } from '@/lib/pagination'
import { showToast } from '@/lib/toast'
import { DEFAULT_CARRY, movedSentence } from '@/lib/caseCarry'
import { useCarryQuestions } from '@/queries/applicantCase'
import { guardianHoldLabel } from '@/lib/guardianGate'
import type { components } from '@/api/schema'

type QueueEntry = components['schemas']['ApplicantAllocationEntry']
type Source = NonNullable<QueueEntry['source']>

const SOURCE_BADGE: Record<Source, { label: string; color: 'info' | 'warning' | 'error' }> = {
  freelancer_signup: { label: 'Freelancer referral', color: 'info' },
  complaint: { label: 'Asked to change', color: 'warning' },
  dispute: { label: 'Reassigned after dispute', color: 'error' },
}

const BLOCKED_LABELS: Record<string, string> = {
  current_consultancy: 'Their current consultancy',
  no_active_staff: 'No active staff',
  subscription_lapsed: 'Subscription lapsed',
  freelancer_disabled: 'Freelancer channel off',
  // Assumptions audit M12 (product owner, 2026-09-19): an account at its seat limit cannot hire
  // the consultant who would serve this student — the invite endpoint already refuses that hire —
  // so allocating to them was allocating into a queue nobody could ever be assigned to. Said in
  // plain words, because "seat_limit_reached" is not a reason anyone can act on.
  seat_limit_reached: 'No seat left to staff the case',
}

// Past this, a row gets an Overdue badge — somebody has been waiting on us for most of a working week.
const OVERDUE_DAYS = 3

function daysWaiting(createdAt: string | undefined): number {
  if (!createdAt) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
}

/** Blocked consultancies grouped by reason, largest group first: [reason, names][]. */
function groupBlocked(blocked: { name: string; blocked_reason?: string | null }[]): [string, string[]][] {
  const groups = new Map<string, string[]>()
  for (const c of blocked) {
    const reason = c.blocked_reason ?? ''
    groups.set(reason, [...(groups.get(reason) ?? []), c.name])
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
}

function titleCase(value: string): string {
  const spaced = value.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * "Canada" plus "Computer Science · Masters", or null when the student has set nothing.
 *
 * ONE destination (assumptions audit M8, product owner 2026-09-19) — the array this read is
 * derived from the scalar now and never holds more than one element, and joining it made the
 * picker look as though a student had ranked several countries.
 */
function lookingFor(e: QueueEntry): { countries: string; detail: string } | null {
  const countries = e.target_country ?? ''
  const detail = [(e.fields_of_interest ?? []).join(', '), e.study_level ? titleCase(e.study_level) : null]
    .filter(Boolean)
    .join(' · ')
  if (!countries && !detail) return null
  return { countries, detail }
}

// The longest note a decline takes (review F-264). The note is filed on the complaint as a
// 2,000-character support note behind the server's own 29-character lead-in, which leaves 1,971.
const DECLINE_NOTE_MAX = 1971

// The other half of a consultancy-change request (user, 2026-08-23: "admin can choose to mark it
// as resolved and do not transfer and remove from transfer list"). Only a student's OWN request can
// be declined — a dispute reassignment was already decided in Disputes.
//
// A note is required, and deliberately so: this ends a student's request without giving them what
// they asked for, and the reason has to survive on the complaint for whoever handles it next.
function ResolveAction({ entry }: { entry: QueueEntry }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const resolve = useResolveAllocationRequest(entry.id!)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Decline the transfer request from ${entry.applicant_name}`}
        title="Resolve without transferring"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <ShieldCheck className="h-4 w-4" />
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title="Resolve Without Transferring"
          widthRem={28}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={resolve.isPending}
                disabled={!note.trim()}
                onClick={() =>
                  resolve.mutate(note.trim(), {
                    onSuccess: () => {
                      showToast('Transfer request resolved')
                      setOpen(false)
                    },
                  })
                }
              >
                Resolve
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              <span className="font-medium text-text-primary">{entry.applicant_name}</span> stays with{' '}
              {entry.current_consultancy_name ?? 'their current consultancy'} — same plan, same consultant. This only
              removes them from the transfer list.
            </p>
            <div className="flex flex-col gap-xs">
              <TextAreaField
                label="Why are you declining the transfer?"
                required
                id={`resolve-note-${entry.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={DECLINE_NOTE_MAX}
                placeholder="Recorded against the complaint for whoever handles it next."
                // The server's own sentence if it still refuses the note.
                error={resolve.isError ? resolve.error.message : undefined}
              />
              {/* Always visible, not a hint: a hint gives way to an error message, and the limit must not. */}
              <p className="pl-lg text-caption text-text-secondary">
                {note.length.toLocaleString('en-US')}/{DECLINE_NOTE_MAX.toLocaleString('en-US')}
              </p>
            </div>
            <p className="text-caption text-text-secondary">
              The complaint itself stays open — declining a transfer is not the same as resolving what they complained
              about.
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}

// Row-level component — useAllocateApplicant(entry.id) must be called at its own render top level,
// not inside Table's `render` callback. The consultancy list comes from the server per row
// (2026-09-11): it used to be the first 20 active accounts, institutes and lapsed ones included,
// with nothing to say which served where the applicant wants to go.
function AllocateAction({ entry }: { entry: QueueEntry }) {
  const [open, setOpen] = useState(false)
  const [consultancyId, setConsultancyId] = useState('')
  // A student changing consultancy has a case to bring things from, and the operator decides what
  // goes (owner's ruling on review I-014, 2026-10-08). A freelancer referral opens a first case:
  // there is nothing to carry, so the boxes are not shown and nothing is sent.
  const isChange = entry.reason === 'consultancy_change'
  const [carry, setCarry] = useState(DEFAULT_CARRY)
  const allocate = useAllocateApplicant(entry.id!)
  // A college may already have accepted the student: then the admission is a question too.
  const asks = useCarryQuestions(open && isChange ? (entry.journey_id ?? undefined) : undefined, entry)
  const candidates = useAllocationCandidates(entry.id!, open)
  const wants = lookingFor(entry)
  // Under 18 and the guardian has not approved: the server refuses the allocation (409
  // `guardian_consent_required`), so the button is not offered and says why.
  const hold = guardianHoldLabel(entry)

  const eligible = (candidates.data ?? []).filter((c) => !c.blocked_reason)
  const blocked = (candidates.data ?? []).filter((c) => c.blocked_reason)
  const options: SearchSelectOption[] = eligible.map((c) => ({
    id: c.consultancy_id,
    label: c.name,
    sublabel: [
      c.serves_countries.length ? `Serves ${c.serves_countries.join(', ')}` : null,
      // CASES PER SEAT is what the ranking reads (assumptions audit M12, product owner
      // 2026-09-19), so it is what the row shows. Raw `active_applicants` made a two-person
      // agency with 4 cases look lighter than a twenty-person firm with 15 — it measured the size
      // of the business, not how busy its people are. Null when no seats are recorded, and the
      // raw count is shown alone rather than inventing a ratio.
      c.active_applicants_per_seat != null
        ? `${c.active_applicants_per_seat.toFixed(1)} cases per seat (${c.active_applicants} open)`
        : `${c.active_applicants} active applicant${c.active_applicants === 1 ? '' : 's'}`,
      `${c.seats_used} / ${c.seat_limit} seats`,
    ]
      .filter(Boolean)
      .join(' · '),
  }))

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={hold != null}
        aria-label={`Allocate ${entry.applicant_name}`}
        title={hold ?? 'Allocate to Consultancy'}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
      >
        <UserPlus className="h-4 w-4" />
      </button>
      {open && !hold && (
        <Modal
          onClose={() => setOpen(false)}
          title="Allocate to Consultancy"
          widthRem={32}
          footer={
            <>
              {allocate.isError && (
                <p className="mr-auto self-center text-body-sm text-error">{allocate.error.message}</p>
              )}
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={allocate.isPending}
                disabled={!consultancyId}
                onClick={() =>
                  allocate.mutate(
                    { consultancyId, carry: isChange ? carry : undefined },
                    {
                      onSuccess: (data) => {
                        // A change row: what the server says went with the case.
                        showToast(isChange ? movedSentence(data?.carried) : `${entry.applicant_name} allocated`)
                        setOpen(false)
                      },
                    },
                  )
                }
              >
                Allocate
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <div className="flex flex-col gap-xs rounded-md border border-border bg-background p-md">
              <p className="text-body-sm font-medium text-text-primary">{entry.applicant_name}</p>
              <p className="text-caption text-text-secondary">
                {wants
                  ? [wants.countries && `Wants ${wants.countries}`, wants.detail].filter(Boolean).join(' · ')
                  : 'No study preferences set yet.'}
              </p>
              {entry.current_consultancy_name && (
                <p className="text-caption text-text-secondary">Leaving {entry.current_consultancy_name}</p>
              )}
            </div>
            <SearchSelect
              id={`allocate-consultancy-${entry.id}`}
              label="Consultancy"
              required
              options={options}
              value={consultancyId}
              onChange={setConsultancyId}
              placeholder={candidates.isLoading ? 'Loading consultancies…' : 'Search consultancy…'}
              disabled={candidates.isLoading}
            />
            {candidates.isError && <p className="text-caption text-error">{candidates.error.message}</p>}
            <p className="text-caption text-text-secondary">
              Consultancies serving where they want to go are listed first, then those with the fewest active
              applicants. Institutes are never offered.
            </p>
            {isChange && (
              <CaseCarryFields value={carry} onChange={setCarry} disabled={allocate.isPending} askAdmission={asks.admission} askPayments={asks.payments} />
            )}
            {blocked.length > 0 && (
              <div className="flex flex-col gap-xs">
                <p className="text-caption font-medium text-text-secondary">Not offered</p>
                <ul className="flex flex-col gap-xs text-caption text-text-secondary">
                  {groupBlocked(blocked).map(([reason, names]) => (
                    <li key={reason}>
                      {BLOCKED_LABELS[reason] ?? reason} ({names.length}): {names.slice(0, 3).join(', ')}
                      {names.length > 3 ? ` and ${names.length - 3} more` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

export function ApplicantAllocationPage() {
  const paging = useCursorPagination()
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'' | Source>('')
  // Search, the Reason filter and the column sort go to the server, which applies them over the
  // whole queue (review F-154); they used to rearrange only the page on screen. With no sort
  // chosen the server's own order stands: oldest first.
  const queue = useApplicantAllocationQueue(
    {
      search: search.trim() || undefined,
      source: sourceFilter || undefined,
      sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    },
    paging.cursor,
  )
  // No `meta` = the frozen mock / an unpaged server: the whole queue is here, no pager.
  const pager = cursorPager(paging, queue.data?.meta)

  const columns: TableColumn<QueueEntry>[] = [
    {
      key: 'applicant_name',
      header: 'Applicant',
      sortable: true,
      render: (e) => (
        <div className="flex flex-col">
          <span className="flex items-center gap-xs font-medium text-text-primary">
            {e.applicant_name}
            {e.case_type === 'pr' && <Badge color="info">PR</Badge>}
          </span>
          <span className="text-caption text-text-secondary">{[e.email, e.phone].filter(Boolean).join(' · ')}</span>
          {/* Under 18 with no guardian approval: the row cannot be allocated yet (owner's ruling
              2026-10-09). It leaves this state by itself when the guardian approves. */}
          {guardianHoldLabel(e) && (
            <span className="mt-0.5 self-start">
              <Badge color={e.guardian_status === 'pending' ? 'warning' : 'error'}>{guardianHoldLabel(e)}</Badge>
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'looking_for',
      header: 'Looking for',
      hideBelow: 'md',
      render: (e) => {
        const wants = lookingFor(e)
        return wants ? (
          <div className="flex flex-col">
            <span className="text-body-sm text-text-primary">{wants.countries || '—'}</span>
            {wants.detail && <span className="text-caption text-text-secondary">{wants.detail}</span>}
          </div>
        ) : (
          <span className="text-caption text-text-secondary">Not set yet</span>
        )
      },
    },
    {
      key: 'source',
      header: 'Reason',
      sortable: true,
      render: (e) => {
        const badge = SOURCE_BADGE[e.source ?? 'freelancer_signup']
        return (
          <div>
            <Badge color={badge.color}>{badge.label}</Badge>
            {/* User-requested (2026-08-19) — "if freelancer sourced please show freelancer name too." */}
            {e.reason === 'freelancer_sourced' && (
              <p className="mt-0.5 text-caption text-text-secondary">
                via {e.freelancer_name ?? 'an unknown freelancer'}
              </p>
            )}
            {e.reason === 'consultancy_change' && (
              <div className="mt-0.5">
                <p className="text-caption text-text-secondary">
                  Currently with {e.current_consultancy_name ?? 'their consultancy'}
                </p>
                {/* The grievance itself, in place — the admin decides having read WHY they want
                    out, not just that they do. */}
                {e.complaint_description && (
                  <p
                    // `max-w-md` computes to 16px here — see styles/tailwind.config.ts.
                    className="mt-0.5 text-caption italic text-text-secondary"
                    style={{ maxWidth: '28rem' }}
                  >
                    “{e.complaint_description}”
                  </p>
                )}
                {/* The text is left out for staff without the Support permission (review F-268):
                    the row is still a complaint, so say where its text can be read. */}
                {e.complaint_id && !e.complaint_description && (
                  <p className="mt-0.5 text-caption text-text-secondary">Complaint text is visible to Support staff.</p>
                )}
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'created_at',
      header: 'Waiting',
      sortable: true,
      render: (e) => {
        const days = daysWaiting(e.created_at)
        return (
          <div className="flex flex-col items-start">
            <span className="flex items-center gap-xs whitespace-nowrap text-body-sm text-text-primary">
              {days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}
              {days > OVERDUE_DAYS && <Badge color="error">Overdue</Badge>}
            </span>
            <span className="text-caption text-text-secondary">since {formatDate(e.created_at!)}</span>
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => (
        <div className="flex items-center justify-end gap-xs">
          {e.source === 'complaint' && <ResolveAction entry={e} />}
          <AllocateAction entry={e} />
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-xs">
          <h1 className="text-h1 text-text-primary">Applicant Allocation</h1>
          {/* Where the rows come from (user, 2026-09-11 — "mention where the data is coming from"). */}
          <p className="text-body-sm text-text-secondary">
            Students waiting for immiNow to choose their consultancy. They arrive here three ways:
          </p>
          <ul className="flex flex-col gap-xs text-body-sm text-text-secondary">
            <li>
              <Badge color="info">Freelancer referral</Badge> signed up in the Sentpo app with a freelancer&rsquo;s
              referral code.
            </li>
            <li>
              <Badge color="warning">Asked to change</Badge> asked to move to a different consultancy when raising a
              complaint in the app.
            </li>
            <li>
              <Badge color="error">Reassigned after dispute</Badge> a case dispute that Support resolved with
              &ldquo;Move the student&rdquo; (Support → Disputes).
            </li>
          </ul>
        </div>

        <Table
          columns={columns}
          rows={queue.data?.items ?? []}
          rowKey={(e) => e.id!}
          loading={queue.isLoading}
          error={queue.isError ? 'Could not load the allocation queue.' : undefined} errorSource={queue.error}
          emptyMessage={search || sourceFilter ? 'No applicants match these filters.' : 'Nothing awaiting allocation.'}
          sort={sort}
          onSortChange={(field, direction) => {
            setSort({ field, direction })
            paging.reset()
          }}
          search={{
            value: search,
            onChange: (value) => {
              if (value === search) return
              setSearch(value)
              paging.reset()
            },
            placeholder: 'Search applicant…',
          }}
          pagination={pager}
          filters={
            <CompactSelect
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value as '' | Source)
                paging.reset()
              }}
              label="Reason"
            >
              <option value="">Any reason</option>
              <option value="freelancer_signup">Freelancer referral</option>
              <option value="complaint">Asked to change</option>
              <option value="dispute">Reassigned after dispute</option>
            </CompactSelect>
          }
        />
      </div>
    </AdminShell>
  )
}
