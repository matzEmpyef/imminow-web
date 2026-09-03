// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { Card } from '@/components/Card'
import { CompactSelect } from '@/components/CompactSelect'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TagEditorMenu } from '@/components/TagEditorMenu'
import { AssignPlanModal } from '@/features/clients/AssignPlanModal'
import { AssignBranchMenu } from '@/components/AssignBranchMenu'
import { StudentProfileFields } from '@/components/StudentProfileFields'
import { useClient, useSetClientBranch, useSetClientTags, useSetFinalizedCountry } from '@/queries/clients'
import { useMyConsultancy } from '@/queries/consultancy'
import { useFeature } from '@/lib/features'
import { useBranches, useEmployees } from '@/queries/staff'
import { useCreateTag, useTags } from '@/queries/tags'
import { usePermission } from '@/lib/permissions'
import { TransferApplicantModal } from './TransferApplicantModal'
import { EditClientDetailsModal } from './EditClientDetailsModal'

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
export function OverviewTab({ clientId, onViewPlan }: { clientId: string; onViewPlan: () => void }) {
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
