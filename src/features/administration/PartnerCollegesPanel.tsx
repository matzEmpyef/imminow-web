import { useState } from 'react'
import { SelectField } from '@/components/SelectField'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CountryLabel } from '@/components/CountryLabel'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { SearchSelect } from '@/components/SearchSelect'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { useAdminColleges } from '@/queries/adminColleges'
import { useCourses } from '@/queries/courseSuggestions'
import {
  usePartnerColleges,
  useAddPartnerCollege,
  useUpdatePartnerCollege,
  useRemovePartnerCollege,
  type PartnerCollege,
  type PayerMethod,
} from '@/queries/partnerColleges'

const PAYER_LABEL: Record<PayerMethod, string> = { college: 'College', applicant: 'Applicant', split: 'Split' }
const ALL_PAYERS: PayerMethod[] = ['college', 'applicant', 'split']
const needsCommission = (payer: PayerMethod | '') => payer === 'college' || payer === 'split'

// Partner Colleges (COURSES_MODULE_PLAN.md §1.7/§4.2, workstream F) — which colleges this
// consultancy works with, the agreed commission payer method per college, and per-college
// course EXCLUSIONS (default: all courses included, so new courses are covered automatically).
// One shared panel serves the consultancy's own Consultancy Management tab AND the platform
// admin's configure-on-behalf modal in Manage Consultancies (`consultancyId` set) — same rule
// the backend applies, so the two UIs can't drift.
//
// READ-ONLY FOR AN INSTITUTE (INSTITUTE_ACCOUNT_PLAN D13, 2026-09-10). An institute's partner
// colleges are itself and only itself: one self-referencing row created with the account, which
// it can neither extend nor edit nor remove. The gate is `kind`, deliberately NOT a feature flag
// — registering a `partner_colleges` entitlement would make it a valid `entitlement_overrides`
// key, and that would hand a Super Admin a switch that turns Partner Colleges off for an ORDINARY
// consultancy, the screen where their commission terms are set. Enforcement is the server's 403
// `not_applicable_for_institute`, which refuses add, edit AND remove; this just declines to
// render controls that can only fail.
//
// The row is NOT degenerate — its commission fields stay live, because an institute earns and
// owes commission like any other tenant (D2, revised 2026-09-10). What is fixed is the
// counterparty, not the money, which is why the figures are still shown, just not edited here.
export function PartnerCollegesPanel({
  consultancyId,
  kind,
}: {
  consultancyId?: string
  kind?: 'consultancy' | 'institute'
}) {
  const readOnly = kind === 'institute'
  const relations = usePartnerColleges(consultancyId)
  const addRelation = useAddPartnerCollege(consultancyId)
  const updateRelation = useUpdatePartnerCollege(consultancyId)
  const removeRelation = useRemovePartnerCollege(consultancyId)
  const colleges = useAdminColleges({ limit: 100 })
  // All three payer methods are offered everywhere (user decision, 2026-08-29 — "it should
  // show 3 options"). The old behavior filtered to methods with a Commission Rates row for the
  // college's country, which turned a missing rate into a mysteriously short dropdown; an
  // unpriced method now simply prices at the flagged 10% fallback until the platform sets the
  // rate, and Commission Details badges it.

  const [addCollegeId, setAddCollegeId] = useState('')
  const [addPayer, setAddPayer] = useState<PayerMethod | ''>('')
  const [addCommissionPercent, setAddCommissionPercent] = useState('')
  const [managing, setManaging] = useState<PartnerCollege | null>(null)
  const [removing, setRemoving] = useState<PartnerCollege | null>(null)
  // Set when the payer select is switched to college/split on a row that has no commission %
  // yet — the change is held until the % is supplied, so the two land in one PATCH.
  const [pendingPayerChange, setPendingPayerChange] = useState<{ relation: PartnerCollege; payer: PayerMethod } | null>(
    null,
  )
  const [editingCommission, setEditingCommission] = useState<PartnerCollege | null>(null)

  const partneredIds = new Set((relations.data ?? []).map((r) => r.college_id))
  const collegeOptions = (colleges.data?.items ?? [])
    .filter((c) => !partneredIds.has(c.id))
    .map((c) => ({ id: c.id, label: c.name }))

  const columns: TableColumn<PartnerCollege>[] = [
    {
      key: 'college',
      header: 'College',
      render: (r) => (
        <div className="flex flex-col">
          <span className="flex items-center gap-sm">
            <span className="font-medium text-text-primary">{r.college_name}</span>
            {readOnly && <Badge color="info">This institute</Badge>}
          </span>
          {r.college_country && (
            <CountryLabel name={r.college_country} textClassName="text-caption text-text-secondary" />
          )}
        </div>
      ),
    },
    {
      key: 'payer',
      header: 'Payer method',
      render: (r) => {
        const options = ALL_PAYERS
        if (readOnly) {
          return (
            <div className="flex flex-col">
              <span className="text-body-sm text-text-primary">{PAYER_LABEL[r.payer_method]}</span>
              {needsCommission(r.payer_method) && r.commission_percent != null && (
                <span className="text-caption text-text-secondary">{r.commission_percent}% of tuition</span>
              )}
            </div>
          )
        }
        return (
          <div className="flex flex-col gap-xs">
            <CompactSelect
              dense
              label="Payer method"
              value={r.payer_method}
              onChange={(e) => {
                const nextPayer = e.target.value as PayerMethod
                // Switching INTO college/split with no commission % yet — hold the change
                // until the modal below supplies one, so payer and % land together.
                if (needsCommission(nextPayer) && r.commission_percent == null) {
                  setPendingPayerChange({ relation: r, payer: nextPayer })
                } else {
                  updateRelation.mutate({ id: r.id, payer_method: nextPayer })
                }
              }}
            >
              {options.map((m) => (
                <option key={m} value={m}>
                  {PAYER_LABEL[m]}
                </option>
              ))}
            </CompactSelect>
            {needsCommission(r.payer_method) && (
              <button
                type="button"
                className="text-left text-caption text-text-secondary hover:text-primary hover:underline"
                onClick={() => setEditingCommission(r)}
              >
                {r.commission_percent != null ? `${r.commission_percent}% of tuition` : 'Set commission %'}
              </button>
            )}
          </div>
        )
      },
    },
    {
      key: 'courses',
      header: 'Courses',
      render: (r) => {
        const excluded = (r.excluded_course_ids ?? []).length
        const total = r.course_count ?? 0
        return (
          <div className="flex items-center gap-sm">
            <span className="text-body-sm text-text-primary">
              {excluded === 0 ? `All ${total} included` : `${Math.max(total - excluded, 0)} of ${total} included`}
            </span>
            {!readOnly && (
              <button
                type="button"
                className="text-body-sm text-primary hover:underline"
                onClick={() => setManaging(r)}
              >
                Manage courses
              </button>
            )}
          </div>
        )
      },
    },
    // Removal is refused by the server for an institute (403 not_applicable_for_institute), so
    // the whole column goes rather than rendering a bin that only produces an error.
    ...(readOnly
      ? []
      : [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (r: PartnerCollege) => (
              <button
                type="button"
                aria-label={`Remove ${r.college_name}`}
                className="rounded-md p-1.5 text-text-secondary hover:bg-background hover:text-error"
                onClick={() => setRemoving(r)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ),
          },
        ]),
  ]

  return (
    <div className="flex flex-col gap-md">
      <p className="text-body-sm text-text-secondary">
        {readOnly
          ? 'An institute works with one college — itself. The relation below is created with the account and cannot be added to, edited or removed; its commercial terms are set by the platform. Every course of this college is included, and this account sees no other college’s catalogue.'
          : 'Colleges this consultancy works with. New courses of a partner college are included automatically — exclude specific ones from Manage courses. Payer-method changes are applied immediately, audited, and visible to the platform team.'}
      </p>

      {/* Full-width row (user-requested, 2026-08-27): the college picker was a fixed w-64, which
          left it cramped and wrapping inside the Manage Consultancies modal while the row had space
          going spare. It now flexes to fill, with the payer select and Add button sized to their
          content at the end. Absent entirely for an institute — POST /consultancy-colleges is
          refused 403 `not_applicable_for_institute`, so there is nothing this row could do. */}
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-sm">
          <div className="min-w-[16rem] flex-1">
            <SearchSelect
              id="pc-college"
              label="Add a college"
              options={collegeOptions}
              value={addCollegeId}
              onChange={(id) => {
                setAddCollegeId(id)
                setAddPayer('')
              }}
              placeholder="Search colleges…"
            />
          </div>
          <SelectField
            label="Payer method"
            id="pc-payer"
            className="w-48 shrink-0"
            value={addPayer}
            disabled={!addCollegeId}
            onChange={(e) => {
              setAddPayer(e.target.value as PayerMethod)
              setAddCommissionPercent('')
            }}
          >
            <option value="">Select…</option>
            {ALL_PAYERS.map((m) => (
              <option key={m} value={m}>
                {PAYER_LABEL[m]}
              </option>
            ))}
          </SelectField>
          {needsCommission(addPayer) && (
            <TextField
              label="% of tuition to consultancy"
              id="pc-commission-percent"
              type="number"
              min={0}
              max={100}
              step="0.1"
              required
              className="w-48 shrink-0"
              value={addCommissionPercent}
              onChange={(e) => setAddCommissionPercent(e.target.value)}
            />
          )}
          <Button
            disabled={
              !addCollegeId ||
              !addPayer ||
              (needsCommission(addPayer) &&
                (addCommissionPercent === '' || Number(addCommissionPercent) < 0 || Number(addCommissionPercent) > 100))
            }
            loading={addRelation.isPending}
            onClick={() =>
              addRelation.mutate(
                {
                  college_id: addCollegeId,
                  payer_method: addPayer as PayerMethod,
                  ...(needsCommission(addPayer) ? { commission_percent: Number(addCommissionPercent) } : {}),
                },
                {
                  onSuccess: () => {
                    setAddCollegeId('')
                    setAddPayer('')
                    setAddCommissionPercent('')
                  },
                },
              )
            }
          >
            Add
          </Button>
        </div>
      )}

      <Table
        columns={columns}
        rows={relations.data ?? []}
        rowKey={(r) => r.id}
        loading={relations.isLoading}
        error={relations.isError ? 'Could not load partner colleges.' : undefined}
        emptyMessage="No partner colleges yet — add the first one above."
      />

      {managing && (
        <ManageCoursesModal
          relation={managing}
          onClose={() => setManaging(null)}
          onSave={(excludedIds) =>
            updateRelation.mutate(
              { id: managing.id, excluded_course_ids: excludedIds },
              { onSuccess: () => setManaging(null) },
            )
          }
          saving={updateRelation.isPending}
        />
      )}

      {removing && (
        <Modal title="Remove partner college" onClose={() => setRemoving(null)}>
          <p className="text-body text-text-primary">
            Remove <span className="font-medium">{removing.college_name}</span> from this consultancy&rsquo;s partner
            colleges? Its courses will stop showing this consultancy as able to help.
          </p>
          <div className="mt-lg flex justify-end gap-sm">
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={removeRelation.isPending}
              onClick={() => removeRelation.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
            >
              Remove
            </Button>
          </div>
        </Modal>
      )}

      {pendingPayerChange && (
        <CommissionPercentModal
          relation={pendingPayerChange.relation}
          payerLabel={PAYER_LABEL[pendingPayerChange.payer]}
          onClose={() => setPendingPayerChange(null)}
          saving={updateRelation.isPending}
          onSave={(percent) =>
            updateRelation.mutate(
              {
                id: pendingPayerChange.relation.id,
                payer_method: pendingPayerChange.payer,
                commission_percent: percent,
              },
              { onSuccess: () => setPendingPayerChange(null) },
            )
          }
        />
      )}

      {editingCommission && (
        <CommissionPercentModal
          relation={editingCommission}
          onClose={() => setEditingCommission(null)}
          saving={updateRelation.isPending}
          onSave={(percent) =>
            updateRelation.mutate(
              { id: editingCommission.id, commission_percent: percent },
              { onSuccess: () => setEditingCommission(null) },
            )
          }
        />
      )}
    </div>
  )
}

// The % of tuition the consultancy receives from this college (user decision, 2026-08-28) —
// required the moment a payer method puts the college on the hook for any money. Shared by the
// inline "Set commission %" / "N% of tuition" edit affordance and the payer-select's own
// switch-into-college-or-split flow, so both land through the same validated path.
function CommissionPercentModal({
  relation,
  payerLabel,
  onClose,
  onSave,
  saving,
}: {
  relation: PartnerCollege
  payerLabel?: string
  onClose: () => void
  onSave: (percent: number) => void
  saving: boolean
}) {
  const [value, setValue] = useState(relation.commission_percent != null ? String(relation.commission_percent) : '')
  const numeric = value === '' ? null : Number(value)
  const valid = numeric != null && Number.isFinite(numeric) && numeric >= 0 && numeric <= 100

  return (
    <Modal title={`Commission % — ${relation.college_name}`} onClose={onClose}>
      <p className="text-body-sm text-text-secondary">
        The % of the tuition fee this consultancy receives from {relation.college_name}
        {payerLabel ? ` as its payer method changes to ${payerLabel}` : ''}. immiNow&rsquo;s own cut is a % of this
        commission, not of the raw tuition.
      </p>
      <div className="mt-md">
        <TextField
          label="% of tuition to consultancy"
          id="pc-edit-commission-percent"
          type="number"
          min={0}
          max={100}
          step="0.1"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="mt-lg flex justify-end gap-sm">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!valid} loading={saving} onClick={() => numeric != null && onSave(numeric)}>
          Save
        </Button>
      </div>
    </Modal>
  )
}

// The quiet exclusion picker (plan §4.2's "invisible-until-needed") — checked = included.
// Unchecking excludes; everything else, including future courses, stays covered.
function ManageCoursesModal({
  relation,
  onClose,
  onSave,
  saving,
}: {
  relation: PartnerCollege
  onClose: () => void
  onSave: (excludedIds: string[]) => void
  saving: boolean
}) {
  const courses = useCourses({ collegeId: relation.college_id, limit: 100 })
  const [excluded, setExcluded] = useState<Set<string>>(new Set(relation.excluded_course_ids ?? []))

  return (
    <Modal title={`Courses — ${relation.college_name}`} onClose={onClose}>
      <p className="text-body-sm text-text-secondary">
        Unchecked courses are excluded for this consultancy. New courses the college adds later are included
        automatically.
      </p>
      <div className="mt-md flex max-h-80 flex-col gap-xs overflow-y-auto">
        {(courses.data?.items ?? []).map((c) => (
          <label key={c.id} className="flex items-center gap-sm text-body-sm text-text-primary">
            <input
              type="checkbox"
              checked={!excluded.has(c.id)}
              onChange={(e) =>
                setExcluded((prev) => {
                  const next = new Set(prev)
                  if (e.target.checked) next.delete(c.id)
                  else next.add(c.id)
                  return next
                })
              }
            />
            {c.name}
          </label>
        ))}
        {courses.isLoading && <p className="text-body-sm text-text-secondary">Loading courses…</p>}
        {!courses.isLoading && (courses.data?.items ?? []).length === 0 && (
          <p className="text-body-sm text-text-secondary">This college has no courses yet.</p>
        )}
      </div>
      <div className="mt-lg flex justify-end gap-sm">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={saving} onClick={() => onSave([...excluded])}>
          Save
        </Button>
      </div>
    </Modal>
  )
}
