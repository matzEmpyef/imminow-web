import { useMemo, useState } from 'react'
import { SelectField } from '@/components/SelectField'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { SearchSelect } from '@/components/SearchSelect'
import { Table, type TableColumn } from '@/components/Table'
import { useAdminColleges, useCollegeDetail } from '@/queries/adminColleges'
import { useCourses } from '@/queries/courseSuggestions'
import { useCommissionRates, useMyCommissionRates } from '@/queries/commissionRates'
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

// Partner Colleges (COURSES_MODULE_PLAN.md §1.7/§4.2, workstream F) — which colleges this
// consultancy works with, the agreed commission payer method per college, and per-college
// course EXCLUSIONS (default: all courses included, so new courses are covered automatically).
// One shared panel serves the consultancy's own Consultancy Management tab AND the platform
// admin's configure-on-behalf modal in Manage Consultancies (`consultancyId` set) — same rule
// the backend applies, so the two UIs can't drift.
export function PartnerCollegesPanel({ consultancyId }: { consultancyId?: string }) {
  const relations = usePartnerColleges(consultancyId)
  const addRelation = useAddPartnerCollege(consultancyId)
  const updateRelation = useUpdatePartnerCollege(consultancyId)
  const removeRelation = useRemovePartnerCollege(consultancyId)
  const colleges = useAdminColleges({ limit: 100 })
  // The payer dropdown only offers methods the platform has actually priced for the college's
  // country (plan §1.7) — self side reads its own rates, on-behalf reads the target's.
  const myRates = useMyCommissionRates()
  const behalfRates = useCommissionRates(consultancyId)
  const rates = (consultancyId ? behalfRates.data : myRates.data) ?? []

  const [addCollegeId, setAddCollegeId] = useState('')
  const [addPayer, setAddPayer] = useState<PayerMethod | ''>('')
  const [managing, setManaging] = useState<PartnerCollege | null>(null)
  const [removing, setRemoving] = useState<PartnerCollege | null>(null)

  const partneredIds = new Set((relations.data ?? []).map((r) => r.college_id))
  const collegeOptions = (colleges.data?.items ?? [])
    .filter((c) => !partneredIds.has(c.id))
    .map((c) => ({ id: c.id, label: c.name }))

  const pricedMethods = (country: string | null | undefined): PayerMethod[] =>
    ALL_PAYERS.filter((m) => rates.some((r) => r.destination_country === country && r.payer_method === m))

  // The colleges LIST omits campuses at 10K+ scale, so the selected college's country comes
  // from its own detail fetch — one request, only once a college is actually picked.
  const addCollegeDetail = useCollegeDetail(addCollegeId || undefined)
  const addCountry = addCollegeDetail.data?.campuses?.[0]?.country ?? null
  const addMethods = useMemo(() => pricedMethods(addCountry), [addCountry, rates]) // eslint-disable-line react-hooks/exhaustive-deps

  const columns: TableColumn<PartnerCollege>[] = [
    {
      key: 'college',
      header: 'College',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{r.college_name}</span>
          {r.college_country && <span className="text-caption text-text-secondary">{r.college_country}</span>}
        </div>
      ),
    },
    {
      key: 'payer',
      header: 'Payer method',
      render: (r) => {
        const priced = pricedMethods(r.college_country)
        // Priced methods plus the row's current one — an existing agreement whose method the
        // platform hasn't priced (yet) still has to display, flagged rather than hidden.
        const options = ALL_PAYERS.filter((m) => priced.includes(m) || m === r.payer_method)
        return (
          <select
            className="h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text-primary"
            value={r.payer_method}
            onChange={(e) => updateRelation.mutate({ id: r.id, payer_method: e.target.value as PayerMethod })}
          >
            {options.map((m) => (
              <option key={m} value={m}>
                {PAYER_LABEL[m]}
                {!priced.includes(m) ? ' (not priced)' : ''}
              </option>
            ))}
          </select>
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
            <button type="button" className="text-body-sm text-primary hover:underline" onClick={() => setManaging(r)}>
              Manage courses
            </button>
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
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
  ]

  return (
    <div className="flex flex-col gap-md">
      <p className="text-body-sm text-text-secondary">
        Colleges this consultancy works with. New courses of a partner college are included automatically — exclude
        specific ones from Manage courses. Payer-method changes are applied immediately, audited, and visible to the
        platform team.
      </p>

      <div className="flex flex-wrap items-end gap-sm">
        <div className="w-64">
          <label className="mb-1 block text-body-sm font-medium text-text-primary" htmlFor="pc-college">
            Add a college
          </label>
          <SearchSelect
            id="pc-college"
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
          value={addPayer}
          disabled={!addCollegeId || addMethods.length === 0}
          onChange={(e) => setAddPayer(e.target.value as PayerMethod)}
        >
          <option value="">Select…</option>
          {addMethods.map((m) => (
            <option key={m} value={m}>
              {PAYER_LABEL[m]}
            </option>
          ))}
        </SelectField>
        <Button
          disabled={!addCollegeId || !addPayer}
          loading={addRelation.isPending}
          onClick={() =>
            addRelation.mutate(
              { college_id: addCollegeId, payer_method: addPayer as PayerMethod },
              {
                onSuccess: () => {
                  setAddCollegeId('')
                  setAddPayer('')
                },
              },
            )
          }
        >
          Add
        </Button>
        {addCollegeId && addMethods.length === 0 && (
          <p className="text-body-sm text-warning">
            No commission rates priced for {addCountry ?? 'this country'} yet — ask the platform team.
          </p>
        )}
      </div>

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
    </div>
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
