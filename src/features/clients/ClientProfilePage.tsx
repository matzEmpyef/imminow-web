import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { TagEditorMenu } from '@/components/TagEditorMenu'
import { AssignPlanModal } from '@/components/AssignPlanModal'
import { AssignBranchMenu } from '@/components/AssignBranchMenu'
import { StudentProfileFields } from '@/components/StudentProfileFields'
import { PlanStepBuilder } from '@/components/PlanStepBuilder'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { ApiError } from '@/api/errors'
import {
  useAddInternalNote,
  useClient,
  useClientActivity,
  useCommissions,
  useInternalNotes,
  useReopenPlan,
  useSelectedColleges,
  useSetClientBranch,
  useSetClientTags,
  useSetFinalizedCountry,
  useUpdateSelectedCollege,
} from '@/queries/clients'
import { useDeleteInstallment } from '@/queries/commissionEntries'
import { useLatestFormResponse, usePlan, useSaveFormResponse } from '@/queries/plans'
import { useDownloadUrl, useUploadFile, useUploads } from '@/queries/uploads'
import { useMyConsultancy } from '@/queries/consultancy'
import { useFeature } from '@/lib/features'
import { useBranches, useEmployees } from '@/queries/staff'
import { useCreateTag, useTags } from '@/queries/tags'
import { useFormTemplate } from '@/queries/formTemplates'
import { formatDate, formatDateTime } from '@/lib/time'
import { usePermission } from '@/lib/permissions'
import { formatAmountOnly, formatMoney, formatMoneyAmount } from '@/lib/money'
import { CloseClientModal } from './CloseClientModal'
import { TransferApplicantModal } from './TransferApplicantModal'
import { ReopenClientModal } from './ReopenClientModal'
import { EditClientDetailsModal } from './EditClientDetailsModal'
import { ShareFromLibraryModal } from './ShareFromLibraryModal'
import { AddSelectedCollegeModal } from './AddSelectedCollegeModal'
import { AcceptCollegeModal } from './AcceptCollegeModal'
import { RevertAcceptanceModal } from './RevertAcceptanceModal'
import { RecordInstallmentModal } from './RecordInstallmentModal'
import { RecordPrContributionModal } from './RecordPrContributionModal'

type SelectedCollegeRowData = import('@/api/schema').components['schemas']['SelectedCollege']

const TABS = [
  'Overview',
  'Plan',
  'Forms',
  'Commissions',
  'Selected Colleges',
  'Documents',
  'Internal Notes',
  'Activity',
] as const
type Tab = (typeof TABS)[number]

// FORWARD-ONLY lifecycle (user decision, 2026-08-28) — mirrors the server's transition map:
// one step at a time, rejected legal from applied or offer_received, accepted/rejected final
// (a wrong acceptance goes through the audited revert, never backward through the map).
// `suggested` is the birth status of every consultant add and has NO staff moves: only the
// student's own save to Dream Courses turns it into a selected college — this tab lists such
// rows as an awaiting count, never as selections.
type CollegeStatus = 'suggested' | 'considering' | 'applied' | 'offer_received' | 'accepted' | 'rejected'
const COLLEGE_STATUS_INFO: Record<
  CollegeStatus,
  { label: string; color: 'secondary' | 'info' | 'warning' | 'success' | 'error' }
> = {
  suggested: { label: 'Suggested — awaiting student', color: 'secondary' },
  considering: { label: 'Considering', color: 'secondary' },
  applied: { label: 'Applied', color: 'info' },
  offer_received: { label: 'Offer received', color: 'warning' },
  accepted: { label: 'Accepted', color: 'success' },
  rejected: { label: 'Rejected', color: 'error' },
}
const COLLEGE_NEXT_STEPS: Record<CollegeStatus, CollegeStatus[]> = {
  suggested: [],
  considering: ['applied'],
  applied: ['offer_received', 'rejected'],
  offer_received: ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
}

const STATUS_INFO: Record<string, { label: string; color: 'warning' | 'info' | 'success' | 'secondary' }> = {
  pending_plan_assignment: { label: 'Pending Plan', color: 'warning' },
  in_plan: { label: 'In Plan', color: 'info' },
  plan_complete: { label: 'Plan Complete', color: 'success' },
  closed: { label: 'Closed', color: 'secondary' },
  closed_completed: { label: 'Closed', color: 'secondary' },
}

// Rebuilt (user-requested, 2026-08-15, loosely inspired by a screenshot of the user's *other*
// immiNow product — visual reference only, not copied field-for-field: no Priority/photo-upload/
// Family-Info-style fields invented here that don't exist in this schema). Was a single bare
// Contact list; now an avatar + status header, a fuller Contact block (adds Consultant), editable
// Tags (parity with Clients List's own TagEditorMenu — Overview never had tag editing before),
// and a Plan summary card with a progress bar that jumps to the full Plan tab on click.
function OverviewTab({ clientId, onViewPlan }: { clientId: string; onViewPlan: () => void }) {
  const client = useClient(clientId)
  const tags = useTags()
  const createTag = useCreateTag()
  const setClientTags = useSetClientTags()
  const employees = useEmployees()
  const branches = useBranches()
  const setClientBranch = useSetClientBranch()
  const consultancy = useMyConsultancy()
  const setFinalizedCountry = useSetFinalizedCountry()
  const [showAssignPlan, setShowAssignPlan] = useState(false)
  const [showEditDetails, setShowEditDetails] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  // Deliberately low prominence (user 2026-08-20: "Transfer Applicant should not be that
  // accessible") — a muted footer link, not a button, and permission-gated on top. Also gated on
  // the `applicant_transfer` entitlement (Ultimate by default) — outbound transfer is a plan
  // feature; accepting an INCOMING one stays open regardless, it's the other consultancy's flag.
  const hasTransferPermission = usePermission('clients.transfer_applicant')
  const hasApplicantTransfer = useFeature('applicant_transfer')
  const canTransferApplicant = hasTransferPermission && hasApplicantTransfer
  const canAssignTemplate = usePermission('clients.assign_template')
  const navigate = useNavigate()
  if (!client.data) return null
  const data = client.data
  const statusInfo = STATUS_INFO[data.status] ?? { label: data.status.replace(/_/g, ' '), color: 'secondary' as const }
  const [doneRaw, totalRaw] = data.progress.split('/')
  const total = Number(totalRaw) || 0
  const percent = total > 0 ? Math.round((Number(doneRaw) / total) * 100) : 0
  // Scoped to the assigned consultant's own branches (user-requested, 2026-08-15 — "can be
  // changed to any of the branch consultant is mapped to"), not every consultancy branch, unlike
  // the equivalent Lead widget. Mirrors the PATCH /clients/{id}/branch server-side constraint,
  // including its admin bypass — consultancy admins cover every branch by default (user-requested
  // follow-up, "Consultancy admin should have access to all branch by default"), regardless of
  // what's actually stored in their own branch_ids.
  const assignedEmployee = employees.data?.items.find((e) => e.id === data.assigned_employee_id)
  const employeeBranches = assignedEmployee?.is_consultancy_admin
    ? (branches.data ?? [])
    : (branches.data ?? []).filter((b) => assignedEmployee?.branch_ids?.includes(b.id!))

  return (
    <div className="grid grid-cols-3 gap-md">
      <Card className="col-span-2 flex flex-col gap-md">
        <div className="flex items-center gap-md">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-h2 font-semibold text-primary">
            {data.student.first_name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-h3 text-text-primary">
              {data.student.first_name} {data.student.last_name}
            </p>
            <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
          </div>
        </div>

        {/* User-requested (2026-08-19) — "consultant has to select country finalized to apply.
            it should be prominent." A standalone highlighted banner rather than folded into the
            Contact block below, so it can't be missed. Options restricted to the consultancy's
            own `countries_served` (user-requested follow-up, 2026-08-19 — "show only the
            countries consultant serve"), not the full platform country catalog — same narrowing
            already applied to Commission Rates' country list. */}
        <div className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-primary bg-primary-subtle px-md py-sm">
          <span className="text-body-sm font-medium text-primary">Country finalized to apply</span>
          <select
            value={data.finalized_country ?? ''}
            onChange={(e) => setFinalizedCountry.mutate({ id: clientId, country: e.target.value || null })}
            disabled={setFinalizedCountry.isPending}
            className="h-9 rounded-md border border-border bg-surface px-3 text-body-sm text-text-primary"
          >
            <option value="">Not decided yet</option>
            {consultancy.data?.countries_served?.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-h3 text-text-primary">Contact</h2>
            <button
              type="button"
              onClick={() => setShowEditDetails(true)}
              aria-label="Edit contact details"
              title="Edit contact details"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
          <dl className="mt-sm flex flex-col gap-xs text-body-sm">
            <div className="flex justify-between">
              <dt className="text-text-secondary">Email</dt>
              <dd className="text-text-primary">{data.student.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Phone</dt>
              <dd className="text-text-primary">{data.student.phone ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Address</dt>
              <dd className="text-text-primary">{data.address ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Case type</dt>
              <dd className="text-text-primary capitalize">{data.case_type}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Consultant</dt>
              <dd className="text-text-primary">{data.assigned_employee_name ?? 'Unassigned'}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Branch</dt>
              <dd className="flex items-center gap-xs text-text-primary">
                {branches.data?.find((b) => b.id === data.branch_id)?.name ?? 'Unassigned'}
                {employeeBranches.length > 1 && (
                  <AssignBranchMenu
                    branches={employeeBranches.map((b) => ({ id: b.id!, name: b.name }))}
                    currentBranchId={data.branch_id}
                    onSelect={(branchId) => setClientBranch.mutate({ id: clientId, branchId })}
                    label={`Set branch for ${data.student.first_name} ${data.student.last_name}`}
                    description="Choose which of your branches this client should be mapped to."
                    iconOnly={false}
                  />
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h2 className="text-h3 text-text-primary">Tags</h2>
          <div className="mt-sm flex flex-wrap items-center gap-xs">
            {(data.tags ?? []).length === 0 && <p className="text-body-sm text-text-secondary">No tags added.</p>}
            {data.tags?.map((t) => (
              <Badge key={t} color="secondary">
                {t}
              </Badge>
            ))}
            <TagEditorMenu
              tags={data.tags ?? []}
              catalog={tags.data ?? []}
              onCreateTag={(name) => createTag.mutateAsync(name)}
              onSave={(next) => setClientTags.mutate({ id: clientId, tags: next })}
              saving={setClientTags.isPending}
              label={`Edit tags for ${data.student.first_name} ${data.student.last_name}`}
            />
          </div>
        </div>
      </Card>

      <div className="col-span-1 flex flex-col gap-md">
        <Card className="flex flex-col gap-sm">
          <h2 className="text-h3 text-text-primary">Plan</h2>
          {data.plan_template_name ? (
            <button type="button" onClick={onViewPlan} className="flex flex-col gap-xs text-left">
              <p className="text-body-sm font-medium text-text-primary hover:underline">{data.plan_template_name}</p>
              <div className="h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-caption text-text-secondary">{data.progress} steps complete</p>
            </button>
          ) : (
            <>
              <p className="text-body-sm text-text-secondary">No plan assigned yet.</p>
              {canAssignTemplate && (
                <Button variant="secondary" className="w-fit" onClick={() => setShowAssignPlan(true)}>
                  Assign a Plan
                </Button>
              )}
            </>
          )}
        </Card>

        {/* The same course-selection-relevant slice of the student's own app profile Course
            Finder's popups and Lead Details' "View study preference" already show, via the SAME
            shared component (user, 2026-08-24: "we need to see mobile app profile details, show
            it below plan card in overview"; renamed from "App Profile" the same session). */}
        <Card className="flex flex-col gap-sm">
          <h2 className="text-h3 text-text-primary">Study Preference</h2>
          <StudentProfileFields prefs={data.preferences} />
        </Card>
      </div>

      {canTransferApplicant && (
        <div className="col-span-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowTransfer(true)}
            className="text-caption text-text-secondary hover:text-error hover:underline"
          >
            Transfer applicant to another consultancy
          </button>
        </div>
      )}

      {showAssignPlan && <AssignPlanModal clientId={clientId} onClose={() => setShowAssignPlan(false)} />}
      {showEditDetails && (
        <EditClientDetailsModal
          clientId={clientId}
          currentAddress={data.address}
          currentPhone={data.student.phone}
          onClose={() => setShowEditDetails(false)}
        />
      )}
      {showTransfer && (
        <TransferApplicantModal
          clientId={clientId}
          clientName={`${data.student.first_name} ${data.student.last_name}`}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => navigate('/clients')}
        />
      )}
    </div>
  )
}

function PlanTab({ clientId, initialStepId }: { clientId: string; initialStepId?: string }) {
  const plan = usePlan(clientId)
  const [showAssignPlan, setShowAssignPlan] = useState(false)
  const canAssignTemplate = usePermission('clients.assign_template')
  if (plan.isLoading) return <Skeleton className="h-24 rounded-lg" />
  // T4 (third-pass review): only the documented no-plan 404 is the empty state. Any OTHER
  // failure (500, 403) used to render "No plan assigned yet." + Assign on a client who HAS a
  // plan — inviting a second assignment instead of a retry.
  const isNoPlanYet = plan.error instanceof ApiError && plan.error.code === 'not_found'
  if (plan.isError && !isNoPlanYet) {
    return <ErrorState message="Could not load the plan." onRetry={() => plan.refetch()} />
  }
  if (plan.isError || !plan.data) {
    return (
      <>
        <Card className="flex items-center justify-between">
          <p className="text-body text-text-secondary">No plan assigned yet.</p>
          {canAssignTemplate && <Button onClick={() => setShowAssignPlan(true)}>Assign a Plan</Button>}
        </Card>
        {showAssignPlan && <AssignPlanModal clientId={clientId} onClose={() => setShowAssignPlan(false)} />}
      </>
    )
  }
  return <PlanStepBuilder clientId={clientId} initialStepId={initialStepId} />
}

// One source's expected-vs-received line with a progress bar — the same treatment for the
// college side and the applicant side so partial payment reads at a glance.
function ExpectedVsReceived({
  label,
  expected,
  received,
}: {
  label: string
  expected: { amount?: number | null; currency: string } | null | undefined
  received: { amount?: number | null; currency: string } | null | undefined
}) {
  if (!expected) return null
  const expectedAmount = expected.amount ?? 0
  const receivedAmount = received?.amount ?? 0
  const pct = expectedAmount > 0 ? Math.min(100, Math.round((receivedAmount / expectedAmount) * 100)) : 0
  const settled = expectedAmount > 0 && receivedAmount >= expectedAmount
  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center justify-between text-body-sm">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-text-secondary">
          {formatAmountOnly(expected.currency, receivedAmount)} / {formatAmountOnly(expected.currency, expectedAmount)}{' '}
          {expected.currency}
          {settled ? ' · fully paid' : pct > 0 ? ` · ${pct}%` : ''}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-background">
        <div className={`h-full rounded-full ${settled ? 'bg-success' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Reworked 2026-08-28: driven by the case's commission entry (created in the Accept popup, or
// directly for PR cases). DELIBERATELY shows no platform cut/rate — tiered visibility puts
// those on the Commission Details page only.
function CommissionsTab({ clientId }: { clientId: string }) {
  const client = useClient(clientId)
  const commissions = useCommissions(clientId)
  const deleteInstallment = useDeleteInstallment(clientId)
  const canRecord = usePermission('billing.record_payment')
  const [showRecord, setShowRecord] = useState(false)
  const [showPrEntry, setShowPrEntry] = useState(false)
  if (commissions.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (commissions.isError || !commissions.data) {
    return <ErrorState message="Could not load commissions." onRetry={() => commissions.refetch()} />
  }
  const data = commissions.data
  const entry = data.entry
  const isPr = client.data?.case_type === 'pr'

  if (!entry) {
    return (
      <Card className="flex flex-col items-start gap-md">
        <div>
          <h2 className="text-h3 text-text-primary">No commission entry yet</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            {isPr
              ? 'Record the applicant’s agreed contribution to start tracking payments for this PR case.'
              : 'The entry is created when a college is accepted on the Selected Colleges tab — the Accept popup captures the agreed amounts.'}
          </p>
        </div>
        {isPr && canRecord && <Button onClick={() => setShowPrEntry(true)}>Record Applicant Contribution</Button>}
        {showPrEntry && (
          <RecordPrContributionModal
            clientId={clientId}
            finalizedCountry={client.data?.finalized_country ?? null}
            onClose={() => setShowPrEntry(false)}
          />
        )}
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-md">
      <Card className="flex flex-col gap-md">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h2 className="text-h3 text-text-primary">
              {entry.case_type === 'pr'
                ? `PR case — ${entry.destination_country}`
                : (entry.course_name ?? 'Accepted course')}
            </h2>
            <p className="mt-xs text-body-sm text-text-secondary">
              {entry.case_type === 'pr'
                ? 'Applicant contribution'
                : `${entry.college_name ?? ''} · ${entry.destination_country}${entry.course_start ? ` · starts ${entry.course_start.month} ${entry.course_start.year}` : ''}`}
            </p>
          </div>
          <Badge color="info" className="capitalize">
            {entry.payer_method === 'applicant'
              ? 'Applicant pays'
              : entry.payer_method === 'college'
                ? 'College pays'
                : 'Split'}
          </Badge>
        </div>
        <ExpectedVsReceived
          label="From college"
          expected={entry.expected_from_college}
          received={entry.received_from_college}
        />
        <ExpectedVsReceived
          label="From applicant"
          expected={entry.expected_from_student}
          received={entry.received_from_student}
        />
      </Card>

      <Card className="flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text-primary">Payments Received</h2>
          {canRecord && (
            <Button size="sm" onClick={() => setShowRecord(true)}>
              Record Payment
            </Button>
          )}
        </div>
        {data.installments.length === 0 ? (
          <p className="text-body-sm text-text-secondary">
            Nothing received yet — partial payments land here as installments.
          </p>
        ) : (
          <div className="flex flex-col gap-xs">
            {data.installments.map((inst) => (
              <div key={inst.id} className="flex items-center justify-between gap-md text-body-sm">
                <div>
                  <span className="font-medium text-text-primary">{formatMoneyAmount(inst.amount)}</span>
                  <span className="text-text-secondary">
                    {' '}
                    from {inst.source === 'student' ? 'applicant' : 'college'} · {formatDate(inst.received_on)}
                    {inst.note ? ` · ${inst.note}` : ''}
                    {inst.receipt_id ? ' · receipt linked' : ''}
                  </span>
                </div>
                {canRecord && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => deleteInstallment.mutate({ entryId: entry.id, installmentId: inst.id })}
                    disabled={deleteInstallment.isPending}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {deleteInstallment.isError && <p className="text-body-sm text-error">{deleteInstallment.error.message}</p>}
      </Card>

      {(data.invoices.length > 0 || data.receipts.length > 0) && (
        <Card className="flex flex-col gap-md">
          <div>
            <h2 className="text-h3 text-text-primary">Linked Documents</h2>
            <p className="text-caption text-text-secondary">
              Platform invoices and receipts for this case — optional; installments above are the source of truth for
              money received.
            </p>
          </div>
          {data.invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between text-body-sm">
              <span className="text-text-primary">Invoice {inv.number}</span>
              <span className="text-text-secondary">
                {formatMoneyAmount(inv.amount)} — {inv.status}
              </span>
            </div>
          ))}
          {data.receipts.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-body-sm">
              <span className="text-text-primary">Receipt for {r.invoice_number}</span>
              <span className="text-text-secondary">
                {formatMoneyAmount(r.amount)} — {formatDate(r.recorded_at)}
              </span>
            </div>
          ))}
        </Card>
      )}

      {showRecord && (
        <RecordInstallmentModal
          clientId={clientId}
          entry={entry}
          receipts={data.receipts}
          onClose={() => setShowRecord(false)}
        />
      )}
    </div>
  )
}

function SelectedCollegesTab({ clientId }: { clientId: string }) {
  const client = useClient(clientId)
  const colleges = useSelectedColleges(clientId)
  const updateStatus = useUpdateSelectedCollege(clientId)
  const [showAddCollege, setShowAddCollege] = useState(false)
  if (colleges.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (!colleges.data) {
    return <ErrorState message="Could not load selected colleges." onRetry={() => colleges.refetch()} />
  }

  const addCollegeButton = (
    <div className="flex justify-end">
      <Button variant="secondary" onClick={() => setShowAddCollege(true)}>
        Add College
      </Button>
    </div>
  )
  const addCollegeModal = showAddCollege && (
    <AddSelectedCollegeModal
      clientId={clientId}
      finalizedCountry={client.data?.finalized_country ?? null}
      takenCourseIds={colleges.data.map((sc) => sc.course.id)}
      onClose={() => setShowAddCollege(false)}
    />
  )

  // A suggestion is not a selection (user decision, 2026-08-28): rows the student has not yet
  // taken into their Dream Courses stay out of the list below — they show only as an awaiting
  // note, and nothing can be done to them from here.
  const awaiting = colleges.data.filter((sc) => sc.status === 'suggested')
  const selected = colleges.data.filter((sc) => sc.status !== 'suggested')

  const awaitingNote = awaiting.length > 0 && (
    <Card>
      <p className="text-body-sm font-medium text-text-primary">
        {awaiting.length === 1 ? '1 suggestion' : `${awaiting.length} suggestions`} awaiting the student
      </p>
      <p className="text-caption text-text-secondary">
        {awaiting.map((sc) => sc.course.name).join(', ')} — suggested courses become selected colleges once the student
        adds them to their Dream Courses.
      </p>
    </Card>
  )

  if (selected.length === 0) {
    return (
      <div className="flex flex-col gap-md">
        {addCollegeButton}
        {awaitingNote}
        <Card>
          <p className="text-body text-text-secondary">No colleges selected yet.</p>
        </Card>
        {addCollegeModal}
      </div>
    )
  }
  // User-requested (2026-08-19) — "if the country of the all the courses is not same them show
  // an alert in Selected Colleges tab (saying counties of courses are different)." Computed
  // entirely from `course.country` on each row already resolved server-side — no stored flag,
  // so it can never drift out of sync with the actual selection (covers both auto-transferred
  // shortlist courses from a conversion and manually added ones alike). Awaiting suggestions
  // are excluded — they are not selections yet, so they cannot contradict one.
  const selectedCountries = [...new Set(selected.map((sc) => sc.course.country).filter((c): c is string => Boolean(c)))]
  const countryMismatch = selectedCountries.length > 1

  return (
    <div className="flex flex-col gap-md">
      {addCollegeButton}
      {awaitingNote}
      {countryMismatch && (
        <Card className="border-warning bg-warning-subtle">
          <p className="text-body-sm font-medium text-warning">Countries of courses are different</p>
          <p className="text-caption text-text-secondary">
            Selected colleges span {selectedCountries.join(', ')} — worth confirming with the client which country
            they're actually applying to.
          </p>
        </Card>
      )}
      <div className="flex flex-col gap-xs">
        {selected.map((sc) => (
          <SelectedCollegeRow
            key={sc.id}
            clientId={clientId}
            row={sc}
            acceptedElsewhere={selected.find((o) => o.status === 'accepted' && o.id !== sc.id)?.course.name ?? null}
            journeyPayerMethod={client.data?.payer_method ?? null}
            onAdvance={(status) => updateStatus.mutate({ collegeId: sc.id, status })}
            advanceError={
              updateStatus.variables?.collegeId === sc.id && updateStatus.isError ? updateStatus.error.message : null
            }
            advancing={updateStatus.variables?.collegeId === sc.id && updateStatus.isPending}
          />
        ))}
      </div>
      {addCollegeModal}
    </div>
  )
}

// One college's row: status pill + only the moves the forward-only lifecycle allows from here.
// Accepting never fires directly — it opens the Accept popup, which is where the money
// agreement (and thus the commission entry) is captured. Rejecting is terminal, so it takes a
// second click to confirm rather than firing on the first.
function SelectedCollegeRow({
  clientId,
  row,
  acceptedElsewhere,
  journeyPayerMethod,
  onAdvance,
  advanceError,
  advancing,
}: {
  clientId: string
  row: SelectedCollegeRowData
  // The course name of ANOTHER row already accepted on this journey, if any. Accept can then
  // only ever 409 (single accepted case per student), so the button is not shown at all —
  // the UAT sweep (M4, 2026-08-29) caught the queue offering a click that could never work.
  acceptedElsewhere: string | null
  journeyPayerMethod: 'college' | 'applicant' | 'split' | null
  // `suggested` is not an advance target — the map never yields it, and the PATCH enum
  // rightly excludes it.
  onAdvance: (status: Exclude<CollegeStatus, 'suggested'>) => void
  advanceError: string | null
  advancing: boolean
}) {
  const [showAccept, setShowAccept] = useState(false)
  const [showRevert, setShowRevert] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const status = row.status as CollegeStatus
  const info = COLLEGE_STATUS_INFO[status] ?? { label: row.status, color: 'secondary' as const }
  const nextSteps = COLLEGE_NEXT_STEPS[status] ?? []

  return (
    <Card className="flex flex-col gap-sm">
      <div className="flex items-center justify-between gap-md">
        <div>
          <p className="text-body font-medium text-text-primary">{row.course.name}</p>
          <p className="text-caption text-text-secondary">
            {row.course.college_name}
            {row.course.country ? ` · ${row.course.country}` : ''} ·{' '}
            {formatMoney(row.course.fee?.currency, row.course.fee?.amount)}
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <Badge color={info.color}>{info.label}</Badge>
          {nextSteps.includes('applied') && (
            <Button size="sm" variant="secondary" onClick={() => onAdvance('applied')} loading={advancing}>
              Mark Applied
            </Button>
          )}
          {nextSteps.includes('offer_received') && (
            <Button size="sm" variant="secondary" onClick={() => onAdvance('offer_received')} loading={advancing}>
              Offer Received
            </Button>
          )}
          {nextSteps.includes('accepted') &&
            (acceptedElsewhere ? (
              <span
                className="text-caption text-text-secondary"
                title={`${acceptedElsewhere} is already accepted — revert that acceptance first to accept this one.`}
              >
                {acceptedElsewhere} accepted
              </span>
            ) : (
              <Button size="sm" onClick={() => setShowAccept(true)}>
                Accept…
              </Button>
            ))}
          {nextSteps.includes('rejected') &&
            (confirmReject ? (
              <>
                <Button size="sm" variant="destructive" onClick={() => onAdvance('rejected')} loading={advancing}>
                  Confirm Reject
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmReject(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setConfirmReject(true)}>
                Rejected
              </Button>
            ))}
          {status === 'accepted' && (
            <Button size="sm" variant="secondary" onClick={() => setShowRevert(true)}>
              Change acceptance
            </Button>
          )}
        </div>
      </div>
      {advanceError && <p className="text-body-sm text-error">{advanceError}</p>}
      {showAccept && (
        <AcceptCollegeModal
          clientId={clientId}
          row={row}
          journeyPayerMethod={journeyPayerMethod}
          onClose={() => setShowAccept(false)}
        />
      )}
      {showRevert && (
        <RevertAcceptanceModal
          clientId={clientId}
          collegeId={row.id}
          courseName={row.course.name}
          onClose={() => setShowRevert(false)}
        />
      )}
    </Card>
  )
}

// User-requested correction (2026-08-15): this tab is a one-way method for the consultant to
// share documents with the applicant, not a general exchange — "for client to share any
// document they use a step in the plan" instead (a plan step's file_upload component, not this
// tab). So only `uploaded_by: 'consultant'` uploads are shown here; any `student`-origin uploads
// (which only ever arrive via a step submission, never through this tab's own "Send Document")
// are filtered out rather than mislabeled as something this tab can receive.
function DocumentsTab({ clientId }: { clientId: string }) {
  const uploads = useUploads(clientId)
  const uploadFile = useUploadFile(clientId)
  const downloadUrl = useDownloadUrl()
  const [showLibraryPicker, setShowLibraryPicker] = useState(false)

  // H10 fix (frontend review, 1 Sep 2026) — a failed fetch used to fall through to "No documents
  // sent yet." with no way to tell it apart from a genuinely empty tab. Same early-return shape
  // CommissionsTab above already uses.
  if (uploads.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (uploads.isError) {
    return <ErrorState message="Could not load documents." onRetry={() => uploads.refetch()} />
  }
  const sentDocuments = uploads.data?.filter((doc) => doc.uploaded_by === 'consultant') ?? []

  return (
    <Card className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <h2 className="text-h3 text-text-primary">Documents</h2>
        <div className="flex gap-sm">
          {/* User-requested (2026-08-15) — Send Document can also be an existing Document
              Library file, not just a fresh upload. */}
          <Button type="button" variant="secondary" onClick={() => setShowLibraryPicker(true)}>
            From Library
          </Button>
          <label>
            <span className="sr-only">Upload document</span>
            <input
              type="file"
              className="hidden"
              id="doc-upload"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadFile.mutate({ file })
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => document.getElementById('doc-upload')?.click()}
              loading={uploadFile.isPending}
            >
              Send Document
            </Button>
          </label>
        </div>
      </div>
      {showLibraryPicker && <ShareFromLibraryModal clientId={clientId} onClose={() => setShowLibraryPicker(false)} />}
      {sentDocuments.length === 0 && <p className="text-body-sm text-text-secondary">No documents sent yet.</p>}
      <div className="flex flex-col gap-xs">
        {sentDocuments.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between text-body-sm">
            <div>
              <p className="text-text-primary">{doc.filename}</p>
              <p className="text-caption text-text-secondary">Sent {formatDate(doc.created_at)}</p>
            </div>
            <button onClick={() => downloadUrl.mutate(doc.id)} className="text-primary hover:underline">
              Download
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

// User-requested (2026-08-19) — "internal notes.. let's make it cover full page.. add textbox
// and button at bottom." Was a Card with the composer at the top and a short note list below;
// now fills the available height (same tall-panel feel Client/Lead Conversation already use,
// though not the ChatPanel component itself — notes come from any team member, not a two-party
// exchange, so plain author-labeled rows read better here than left/right chat bubbles), with the
// note list scrolling in the middle and the textbox + Add button pinned at the bottom.
function InternalNotesTab({ clientId }: { clientId: string }) {
  const notes = useInternalNotes(clientId)
  const addNote = useAddInternalNote(clientId)
  const [draft, setDraft] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    addNote.mutate(draft, { onSuccess: () => setDraft('') })
  }

  return (
    <div className="flex h-[calc(100vh-16rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card">
      <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
        {notes.data?.length === 0 && <p className="text-body-sm text-text-secondary">No notes yet.</p>}
        <div className="flex flex-col gap-sm">
          {notes.data?.map((note) => (
            <div key={note.id} className="border-b border-border pb-sm last:border-0">
              <p className="text-body-sm text-text-primary">{note.content}</p>
              <p className="text-caption text-text-secondary">
                {note.author.first_name} {note.author.last_name} · {formatDateTime(note.created_at)}
              </p>
            </div>
          ))}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-sm border-t border-border px-lg py-md">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note for the team…"
          className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-body"
        />
        <Button type="submit" loading={addNote.isPending}>
          Add
        </Button>
      </form>
    </div>
  )
}

function ActivityTab({ clientId }: { clientId: string }) {
  const activity = useClientActivity(clientId)
  if (activity.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (activity.isError || !activity.data)
    return <ErrorState message="Could not load activity." onRetry={() => activity.refetch()} />
  if (activity.data.length === 0) {
    return (
      <Card>
        <p className="text-body text-text-secondary">No activity recorded yet.</p>
      </Card>
    )
  }
  return (
    <Card className="flex flex-col gap-sm">
      {activity.data.map((item) => (
        <div key={item.id} className="border-b border-border pb-sm last:border-0">
          <p className="text-body-sm text-text-primary">{item.description}</p>
          <p className="text-caption text-text-secondary">{formatDateTime(item.created_at)}</p>
        </div>
      ))}
    </Card>
  )
}

type FormField = NonNullable<ReturnType<typeof useFormTemplate>['data']>['fields'][number]
type FormAnswers = Record<string, unknown>

// FILLABLE (user, 2026-08-20: "if there is a form to fill they can fill and save… Both can see
// the details and edit") — real inputs per field type, prefilled from the latest saved response
// (which the applicant may have written from the app), saved back through the same
// POST /forms/{id}/submit the app uses. Tables stay read-only here — their row editor lives in
// the app; the saved value still shows.
function FillableField({
  field,
  answers,
  onChange,
}: {
  field: FormField
  answers: FormAnswers
  onChange: (fieldId: string, value: unknown) => void
}) {
  const value = answers[field.id]

  if (field.type === 'group') {
    return (
      <div className="flex flex-col gap-sm rounded-md border border-border p-md">
        <p className="text-body-sm font-medium text-text-primary">{field.label}</p>
        <div className="flex flex-col gap-sm pl-md">
          {(field.fields ?? []).map((child) => (
            <FillableField key={child.id} field={child} answers={answers} onChange={onChange} />
          ))}
        </div>
      </div>
    )
  }

  const label = (
    <span className="text-body-sm text-text-primary">
      {field.label}
      {field.required && <span className="text-required"> *</span>}
    </span>
  )

  switch (field.type) {
    case 'text':
      return (
        <label className="flex flex-col gap-xs">
          {label}
          <input
            type="text"
            className="h-9 rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </label>
      )
    case 'long_text':
      return (
        <label className="flex flex-col gap-xs">
          {label}
          <textarea
            rows={3}
            className="rounded-md border border-border bg-surface p-sm text-body-sm text-text-primary"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </label>
      )
    case 'date':
      return (
        <label className="flex flex-col gap-xs">
          {label}
          <input
            type="date"
            className="h-9 w-fit rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary"
            value={typeof value === 'string' ? value.slice(0, 10) : ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </label>
      )
    case 'single_select':
      return (
        <label className="flex flex-col gap-xs">
          {label}
          <select
            className="h-9 w-fit rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          >
            <option value="">—</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      )
    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="flex flex-col gap-xs">
          {label}
          <div className="flex flex-wrap gap-sm">
            {(field.options ?? []).map((option) => (
              <label key={option} className="flex items-center gap-xs text-body-sm text-text-primary">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.includes(option)}
                  onChange={(e) =>
                    onChange(field.id, e.target.checked ? [...selected, option] : selected.filter((o) => o !== option))
                  }
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      )
    }
    case 'yes_no':
      return (
        <div className="flex items-center justify-between gap-md">
          {label}
          <div className="flex gap-xs">
            {(['Yes', 'No'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChange(field.id, option)}
                className={`rounded-full border px-sm py-1 text-caption font-medium ${
                  value === option
                    ? 'border-pill-selected bg-pill-selected text-text-on-primary'
                    : 'border-border bg-surface text-text-primary'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )
    case 'table':
      return (
        <div className="flex items-center justify-between border-b border-border pb-xs">
          <div>
            {label}
            {field.table_columns && field.table_columns.length > 0 && (
              <p className="text-caption text-text-secondary">
                Columns: {field.table_columns.map((c) => c.label).join(', ')} — rows are filled from the app
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-background px-sm py-0.5 text-caption font-medium text-text-secondary">
            table
          </span>
        </div>
      )
    default:
      return null
  }
}

function LinkedFormViewer({ formId, formName, clientId }: { formId: string; formName: string; clientId: string }) {
  const form = useFormTemplate(formId)
  const saved = useLatestFormResponse(formId, clientId)
  const saveForm = useSaveFormResponse(formId, clientId)
  const [draft, setDraft] = useState<FormAnswers | null>(null)

  if (form.isLoading || saved.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (form.isError || !form.data) {
    return <ErrorState message={`Could not load "${formName}".`} onRetry={() => form.refetch()} />
  }

  const answers = draft ?? ((saved.data?.answers ?? {}) as FormAnswers)

  return (
    <div className="flex flex-col gap-sm">
      {saved.data?.submitted_at && (
        <p className="text-caption text-text-secondary">Last saved {formatDateTime(saved.data.submitted_at)}</p>
      )}
      {form.data.fields.map((field) => (
        <FillableField
          key={field.id}
          field={field}
          answers={answers}
          onChange={(fieldId, value) => setDraft({ ...answers, [fieldId]: value })}
        />
      ))}
      <div className="flex items-center gap-sm">
        <Button
          disabled={draft === null}
          loading={saveForm.isPending}
          onClick={() => saveForm.mutate(answers as Record<string, unknown>, { onSuccess: () => setDraft(null) })}
        >
          Save
        </Button>
        {saveForm.error && <p className="text-body-sm text-error">{saveForm.error.message}</p>}
      </div>
    </div>
  )
}

// User-requested (2026-08-19) — "if there are any forms linked to the plan involved, then show
// the forms one by one in a tab inside client details." Every form_link component across every
// step, in step order, "one by one" via a pager rather than all stacked at once — same pattern
// Manage Questions/Course Suggestions detail popups already use elsewhere in this app for
// paging through a set one at a time.
function FormsTab({ clientId }: { clientId: string }) {
  const plan = usePlan(clientId)
  const [index, setIndex] = useState(0)
  if (plan.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (!plan.data) return <ErrorState message="Could not load the plan." onRetry={() => plan.refetch()} />

  const links = [...plan.data.steps]
    .sort((a, b) => a.position - b.position)
    .flatMap((step) =>
      step.components
        .filter((c) => c.type === 'form_link')
        .map((c) => {
          // `form_template_id` is the contract key (openapi.yaml, mobile, mock server); this tab
          // briefly read a drifted `form_id` and silently showed "No forms linked" for every
          // correctly-seeded plan (user, 2026-08-20: "I cannot see the Form associated with the
          // plan"). Legacy `form_id` stays as a fallback for components written during the drift.
          const payload = (c.payload ?? {}) as { form_template_id?: string; form_id?: string; form_name?: string }
          return {
            stepTitle: step.title,
            formId: payload.form_template_id ?? payload.form_id ?? '',
            formName: payload.form_name || c.label || 'Untitled form',
          }
        }),
    )
    .filter((l) => l.formId)

  if (links.length === 0) {
    return (
      <Card>
        <p className="text-body text-text-secondary">No forms linked to this plan.</p>
      </Card>
    )
  }

  const current = links[Math.min(index, links.length - 1)]

  return (
    <Card className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-h3 text-text-primary">{current.formName}</h2>
          <p className="text-caption text-text-secondary">From step: {current.stepTitle}</p>
        </div>
        <div className="flex items-center gap-sm">
          <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            ← Back
          </Button>
          <span className="text-caption text-text-secondary">
            Form {index + 1} of {links.length}
          </span>
          <Button
            variant="secondary"
            disabled={index === links.length - 1}
            onClick={() => setIndex((i) => Math.min(links.length - 1, i + 1))}
          >
            Next →
          </Button>
        </div>
      </div>
      <LinkedFormViewer formId={current.formId} formName={current.formName} clientId={clientId} />
    </Card>
  )
}

export function ClientProfilePage() {
  const { id = '' } = useParams()
  // Deep-link support (user-requested, 2026-08-19 — Activity's Step Approvals row redirects here
  // "to client plan tab and to the specific step"). Since T5 (third-pass review) the ACTIVE tab
  // lives in the URL, not component state: a refresh mid-review used to remount on Overview and
  // lose the consultant's place. `step` stays a mount-time read — the step selection inside
  // PlanStepBuilder is transient in a way the tab is not.
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStepId = searchParams.get('step') ?? undefined
  const client = useClient(id)
  const plan = usePlan(id)
  const reopenPlan = useReopenPlan(id)
  // Reopening a completed plan is an elevated action — "defaulting to Consultancy Admin only,
  // delegable to trusted staff" (build reference §374). The permission key shipped with the
  // designation editor; the button never checked it until the contract audit (2026-08-23). Also
  // gated on the `case_reopening` entitlement (Business+) since 2026-08-29 — reopening a closed
  // lead/case/plan is a plan feature, not a Starter-core capability.
  const hasCaseReopening = useFeature('case_reopening')
  const canReopenPlan = usePermission('step_review.reopen_plan') && hasCaseReopening
  const canViewCommissions = usePermission('clients.view_commissions')
  const tabParam = searchParams.get('tab')
  const activeTab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'Overview'
  // replace, not push: tab flips shouldn't turn the Back button into a tour of every tab visited.
  function setActiveTab(tab: Tab) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab === 'Overview') next.delete('tab')
        else next.set('tab', tab)
        next.delete('step')
        return next
      },
      { replace: true },
    )
  }
  const [showReopen, setShowReopen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [showCloseCase, setShowCloseCase] = useState(false)
  const [showReopenCase, setShowReopenCase] = useState(false)

  if (client.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  if (client.isError || !client.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load this client." onRetry={() => client.refetch()} />
      </AppShell>
    )
  }

  const data = client.data
  // Was a raw role === 'consultancy_admin' check — swapped to the permission key so an employee
  // whose designation grants clients.view_commissions actually gets the tab (admins still pass
  // via the is_consultancy_admin bypass inside the checker).
  const canSeeCommissions = canViewCommissions
  // Close Case is Starter core (build reference 1.16 made real, 2026-08-29 — hygiene, symmetric
  // with Close Lead) and stays open on every plan. Reopening a closed case is the
  // `case_reopening` entitlement, same flag as Reopen Plan above.
  // Forms tab only appears once the plan actually has something to show (user-requested,
  // 2026-08-19 — "if there are any forms linked to the plan involved, then show the forms") —
  // same cached query PlanTab itself uses, so this doesn't add a second fetch.
  const hasLinkedForms = (plan.data?.steps ?? []).some((step) => step.components.some((c) => c.type === 'form_link'))
  const visibleTabs = TABS.filter((tab) => {
    if (tab === 'Commissions') return canSeeCommissions
    if (tab === 'Selected Colleges') return data.case_type === 'student'
    if (tab === 'Forms') return hasLinkedForms
    return true
  })

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-sm">
            <Link
              to="/clients"
              aria-label="Back to Clients"
              title="Back to Clients"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-h1 text-text-primary">
                {data.student.first_name} {data.student.last_name}
                {data.file_number && (
                  <span className="ml-sm text-body-sm font-normal text-text-secondary">{data.file_number}</span>
                )}
              </h1>
              <p className="text-body-sm text-text-secondary">{data.status.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <div className="flex gap-sm">
            <Link to={`/clients/${id}/conversation`}>
              <Button variant="secondary">Conversation</Button>
            </Link>
            {canReopenPlan && data.status === 'plan_complete' && (
              <Button variant="secondary" onClick={() => setShowReopen((v) => !v)}>
                Reopen Plan
              </Button>
            )}
            {data.status === 'closed' ? (
              hasCaseReopening && (
                <Button variant="secondary" onClick={() => setShowReopenCase(true)}>
                  Reopen Case
                </Button>
              )
            ) : (
              <Button variant="destructive" onClick={() => setShowCloseCase(true)}>
                Close Case
              </Button>
            )}
          </div>
        </div>

        {showCloseCase && (
          <CloseClientModal
            clientId={id}
            clientName={`${data.student.first_name} ${data.student.last_name}`}
            onClose={() => setShowCloseCase(false)}
          />
        )}
        {showReopenCase && (
          <ReopenClientModal
            clientId={id}
            clientName={`${data.student.first_name} ${data.student.last_name}`}
            onClose={() => setShowReopenCase(false)}
          />
        )}

        {showReopen && (
          <Card className="flex items-end gap-sm">
            <TextField
              label="Reason (mandatory)"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="destructive"
              disabled={!reopenReason}
              loading={reopenPlan.isPending}
              onClick={() =>
                reopenPlan.mutate(reopenReason, {
                  onSuccess: () => {
                    setShowReopen(false)
                    setReopenReason('')
                  },
                })
              }
            >
              Confirm Reopen
            </Button>
          </Card>
        )}

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-md py-sm text-body-sm ${
                activeTab === tab ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' && <OverviewTab clientId={id} onViewPlan={() => setActiveTab('Plan')} />}
        {activeTab === 'Plan' && <PlanTab clientId={id} initialStepId={initialStepId} />}
        {activeTab === 'Forms' && hasLinkedForms && <FormsTab clientId={id} />}
        {activeTab === 'Commissions' && canSeeCommissions && <CommissionsTab clientId={id} />}
        {activeTab === 'Selected Colleges' && <SelectedCollegesTab clientId={id} />}
        {activeTab === 'Documents' && <DocumentsTab clientId={id} />}
        {activeTab === 'Internal Notes' && <InternalNotesTab clientId={id} />}
        {activeTab === 'Activity' && <ActivityTab clientId={id} />}
      </div>
    </AppShell>
  )
}
