// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Phone } from 'lucide-react'
import { Card } from '@/components/Card'
import { CompactSelect } from '@/components/CompactSelect'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TagEditorMenu } from '@/components/TagEditorMenu'
import { AssignPlanModal } from '@/features/clients/AssignPlanModal'
import { AssignBranchMenu } from '@/components/AssignBranchMenu'
import { StudentProfilePanels } from '@/components/StudentProfileFields'
import { CountryLabel } from '@/components/CountryLabel'
import { useClient, useSetClientBranch, useSetClientTags, useSetFinalizedCountry } from '@/queries/clients'
import { useMyConsultancy } from '@/queries/consultancy'
import { useFeature } from '@/lib/features'
import { useBranches, useEmployees } from '@/queries/staff'
import { useCreateTag, useTags } from '@/queries/tags'
import { usePermission } from '@/lib/permissions'
import { usePlans } from '@/queries/plans'
import { Skeleton } from '@/components/QueryState'
import { TransferApplicantModal } from './TransferApplicantModal'

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
export function OverviewTab({
  clientId,
  onViewPlan,
}: {
  clientId: string
  // Takes the plan to open, so the Plan tab lands on the one that was clicked rather than
  // whichever happens to be first (2026-09-09).
  onViewPlan: (planId?: string) => void
}) {
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
  const [showTransfer, setShowTransfer] = useState(false)
  // Deliberately low prominence (user 2026-08-20: "Transfer Applicant should not be that
  // accessible") — a muted footer link, not a button, and permission-gated on top. Also gated on
  // the `applicant_transfer` entitlement (Ultimate by default) — outbound transfer is a plan
  // feature; accepting an INCOMING one stays open regardless, it's the other consultancy's flag.
  const hasTransferPermission = usePermission('clients.transfer_applicant')
  const hasApplicantTransfer = useFeature('applicant_transfer')
  const canTransferApplicant = hasTransferPermission && hasApplicantTransfer
  const canAssignTemplate = usePermission('clients.assign_template')
  const plans = usePlans(clientId)
  const planItems = plans.data?.items ?? []
  const navigate = useNavigate()
  if (!client.data) return null
  const data = client.data
  const statusInfo = STATUS_INFO[data.status] ?? { label: data.status.replace(/_/g, ' '), color: 'secondary' as const }
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
      {/* LEFT TWO-THIRDS: who the student is and what they want — name, email and phone, the
          finalized country, then their study preference in full (user, 2026-09-10: "show study
          preference in 2/3 section and contact details in 1/3 section. Keep Email and phone number
          along with study preference"). */}
      <div className="col-span-2 flex flex-col gap-md">
      <Card className="flex flex-col gap-md">
        <div className="flex items-center gap-md">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-h2 font-semibold text-primary">
            {data.student.first_name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-h3 text-text-primary">
              {data.student.first_name} {data.student.last_name}
            </p>
            {/* Case type under the name, with the status (user, 2026-09-10: "Case type we need it
                below the name not in contact card"). */}
            <div className="mt-xs flex flex-wrap items-center gap-xs">
              <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
              {/* "PR Case", not a capitalised "Pr case" (user, 2026-09-10). */}
              {data.case_type && (
                <Badge color="secondary">{data.case_type === 'pr' ? 'PR Case' : 'Student Case'}</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Two to a row, each with room of its own (user, 2026-09-10: "space phone number and
            email.. like only 2 item in the row"). */}
        <dl className="grid grid-cols-1 gap-md text-body-sm sm:grid-cols-2">
          <div className="flex min-w-0 items-center gap-sm">
            <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <dt className="text-caption text-text-secondary">Email</dt>
              <dd className="break-words text-text-primary">{data.student.email}</dd>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-sm">
            <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <dt className="text-caption text-text-secondary">Phone</dt>
              <dd className="text-text-primary">
                {data.student.phone ?? <span className="text-text-secondary">Not added yet</span>}
              </dd>
            </div>
          </div>
        </dl>

        {/* User-requested (2026-08-19) — "consultant has to select country finalized to apply.
            it should be prominent." A standalone highlighted banner rather than folded into the
            Contact block below, so it can't be missed. Options restricted to the consultancy's
            own `countries_served` (user-requested follow-up, 2026-08-19 — "show only the
            countries consultant serve"), not the full platform country catalog — same narrowing
            already applied to Commission Rates' country list. */}
        <div className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-primary bg-primary-subtle px-md py-sm">
          <span className="text-body-sm font-medium text-primary">Country finalized to apply</span>
          <CompactSelect
            value={data.finalized_country ?? ''}
            onChange={(e) => setFinalizedCountry.mutate({ id: clientId, country: e.target.value || null })}
            disabled={setFinalizedCountry.isPending}
            label="Country finalized to apply"
          >
            <option value="">Not decided yet</option>
            {consultancy.data?.countries_served?.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </CompactSelect>
        </div>

      </Card>

      {/* The same study preference the lead and client popups show, as panels — study plan,
          background, about the student — with the completeness bar on top. */}
      {/* On white (user, 2026-09-10: "study preference i need white background"). */}
      <Card className="flex flex-col gap-md">
        <h2 className="text-h3 text-text-primary">Study Preference</h2>
        {/* No "Lives in" here (user, 2026-09-10: "Remove Lives in") — Contact details on the right
            already carries the student's state and country of residence. */}
        <StudentProfilePanels prefs={data.preferences} surface omit={['Lives in']} />
      </Card>
      </div>

      <div className="col-span-1 flex flex-col gap-md">
        {/* EVERY plan, one below the other (user, 2026-09-09) — not the first one with a "+2"
            after it. That summary was written for a column in a table, where there is room for one
            line; here there is room for the list, and a consultant opening a case should see the
            work it is actually running. Each row opens that plan in the Plan tab. */}
        <Card className="flex flex-col gap-sm">
          <h2 className="text-h3 text-text-primary">{planItems.length > 1 ? 'Plans' : 'Plan'}</h2>
          {plans.isLoading && <Skeleton className="h-16 rounded-lg" />}
          {!plans.isLoading && planItems.length === 0 && (
            <>
              <p className="text-body-sm text-text-secondary">No plan assigned yet.</p>
              {canAssignTemplate && (
                <Button variant="secondary" className="w-fit" onClick={() => setShowAssignPlan(true)}>
                  Assign a Plan
                </Button>
              )}
            </>
          )}
          {planItems.map((plan) => {
            const [doneRaw, totalRaw] = (plan.progress ?? '0/0').split('/')
            const total = Number(totalRaw) || 0
            const percent = total > 0 ? Math.round((Number(doneRaw) / total) * 100) : 0
            // The step this plan has got to. `active` is the one in flight whether or not the
            // student can act on it — naming it is what makes the row worth reading.
            const current = plan.steps.find((s) => s.status === 'active')
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => onViewPlan(plan.id)}
                // Named for a screen reader: the visible label is three stacked elements, and a
                // row of buttons that all announce as "button" is a row nobody can navigate.
                aria-label={`Open the ${plan.name} plan`}
                className="flex flex-col gap-xs text-left"
              >
                <p className="text-body-sm font-medium text-text-primary hover:underline">{plan.name}</p>
                <div className="h-2 overflow-hidden rounded-full bg-background">
                  <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
                </div>
                <p className="text-caption text-text-secondary">
                  {plan.progress} steps complete
                  {current && <> &middot; {current.title}</>}
                </p>
              </button>
            )
          })}
          {planItems.length > 0 && canAssignTemplate && (
            <Button variant="secondary" className="w-fit" onClick={() => setShowAssignPlan(true)}>
              Add a plan
            </Button>
          )}
        </Card>

        {/* RIGHT THIRD, read-only (user, 2026-09-10: "No need of edit for phone number and
            address"). Email and phone sit with the student on the left. */}
        <Card className="flex flex-col gap-sm">
          <h2 className="text-h3 text-text-primary">Contact details</h2>
          <dl className="flex flex-col gap-sm text-body-sm">
            <div>
              <dt className="text-caption text-text-secondary">Address</dt>
              <dd className="text-text-primary">{data.address ?? '—'}</dd>
            </div>
            {/* Where the student lives, from their own profile (user, 2026-09-10). */}
            <div>
              <dt className="text-caption text-text-secondary">State</dt>
              <dd className="text-text-primary">{data.residence_state ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">Country of residence</dt>
              <dd className="text-text-primary">
                {data.residence_country ? <CountryLabel name={data.residence_country} /> : '—'}
              </dd>
            </div>
          </dl>
          {/* Where the student lives, then who handles the case — split by a line inside the card's
              padding, with room above and below (user, 2026-09-10: "need full padding"). */}
          <hr className="my-sm border-0 border-t border-border" />
          <dl className="flex flex-col gap-sm text-body-sm">
            <div>
              <dt className="text-caption text-text-secondary">Consultant</dt>
              <dd className="text-text-primary">{data.assigned_employee_name ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">Branch</dt>
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
        </Card>

        <Card className="flex flex-col gap-sm">
          <h2 className="text-h3 text-text-primary">Tags</h2>
          <div className="flex flex-wrap items-center gap-xs">
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
