import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { MultiSelect } from '@/components/MultiSelect'
import { Toggle } from '@/components/Toggle'
import { CountrySelect } from '@/components/CountrySelect'
import { SearchSelect } from '@/components/SearchSelect'
import { useCourseFields } from '@/queries/courseFinder'
import type { usePersonPicker } from '@/lib/usePersonPicker'
import { DURATION_BUCKETS, type FinderState } from './courseFinderState'

interface CourseFinderFiltersProps {
  state: FinderState
  onChange: (patch: Partial<FinderState>) => void
  clientRows: ReturnType<typeof usePersonPicker>['clientRows']
  leadRows: ReturnType<typeof usePersonPicker>['leadRows']
  onPersonChange: (personId: string, kind: 'client' | 'lead') => void
  canCheckFit: boolean
  /** First name of the selected applicant/lead, for the eligibility toggle's label. */
  personName: string | undefined
}

// The finder's whole filter Card (search/field/level/person, country/fee, eligibility toggle,
// sort) — extracted from CourseFinderPage's body in the 2026-08-25 decomposition pass. Pure
// layout: state in, patches out.
export function CourseFinderFilters({
  state,
  onChange,
  clientRows,
  leadRows,
  onPersonChange,
  canCheckFit,
  personName,
}: CourseFinderFiltersProps) {
  const { data: fields } = useCourseFields()

  return (
    <Card>
      {/* Row 1 — what the consultant is looking for, plus who for (user, 2026-08-23).
          Applicant is LAST in the row because it is optional: the finder works as a plain
          catalog search without one, which is what searching on behalf of a lead needs. */}
      <div className="grid grid-cols-1 gap-md md:grid-cols-4">
        <TextField
          label="Search"
          value={state.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Course or college"
        />
        <MultiSelect
          label="Field of study"
          options={fields ?? []}
          selected={state.fieldOfStudy}
          onChange={(fieldOfStudy) => onChange({ fieldOfStudy })}
        />
        <SelectField
          id="cf-level"
          label="Level"
          value={state.level}
          onChange={(e) => onChange({ level: e.target.value })}
        >
          <option value="">Any level</option>
          <option value="bachelors">Bachelors</option>
          <option value="masters">Masters</option>
          <option value="diploma">Diploma</option>
          <option value="phd">PhD</option>
        </SelectField>
        <SearchSelect
          id="cf-client"
          label="Applicant or lead (optional)"
          // Both kinds in one list (user, 2026-08-23: "we need the ability to select leads
          // also"), told apart by the `group` badge SearchSelect already renders for exactly
          // this case (Activity's "Related client or lead" field uses the same idiom).
          // SearchSelect's onChange only carries an id, not which list it came from, so
          // `onChange` below re-derives the kind with a membership check against clientRows —
          // ids never collide between the two kinds, so this is unambiguous.
          options={[
            ...clientRows.map((c) => ({
              id: c.id!,
              label: `${c.student.first_name} ${c.student.last_name}`,
              sublabel: c.file_number ?? undefined,
              group: 'Applicant',
            })),
            ...leadRows.map((l) => ({
              id: l.id,
              label: l.name,
              sublabel: l.origin === 'imported' ? 'Self-sourced' : undefined,
              group: 'Lead',
            })),
          ]}
          value={state.personId}
          onChange={(id) => onPersonChange(id, clientRows.some((c) => c.id === id) ? 'client' : 'lead')}
          placeholder="Search applicants or leads…"
        />
      </div>

      {/* Row 2 — the narrowing filters. */}
      <div className="mt-md grid grid-cols-1 gap-md md:grid-cols-4">
        <CountrySelect
          label="Country"
          size="pill"
          value={state.country}
          onChange={(country) => onChange({ country })}
        />
        <TextField
          label="Max fee (₹ lakh)"
          type="number"
          value={state.feeMaxLakh}
          onChange={(e) => onChange({ feeMaxLakh: e.target.value })}
          placeholder="e.g. 25"
        />
        <SelectField
          id="cf-duration"
          label="Duration"
          value={state.durationBucket}
          onChange={(e) => onChange({ durationBucket: e.target.value })}
        >
          <option value="">Any duration</option>
          {Object.entries(DURATION_BUCKETS).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="mt-md flex flex-wrap items-center justify-between gap-md">
        {/* Only meaningful with an applicant: with nobody to compare against, every course
            has no verdict and the switch would filter nothing while looking like it should.
            The old label ("Hide below-requirement courses") described the MECHANISM; the
            user reported not understanding it (2026-08-23), so it now names the person and
            the effect, with the consequence spelled out underneath. */}
        {canCheckFit ? (
          <div className="flex flex-col gap-0.5">
            <Toggle
              checked={state.eligibleOnly}
              onChange={(eligibleOnly) => onChange({ eligibleOnly })}
              label={`Only show courses ${personName} qualifies for`}
            />
            <p className="text-caption text-text-secondary">
              Courses they clearly miss the requirements for are hidden. Anything still unknown — scores they have not
              added yet — stays visible.
            </p>
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-sm">
          <label className="text-body-sm text-text-secondary" htmlFor="cf-sort">
            Sort
          </label>
          <select
            id="cf-sort"
            className="h-10 rounded-md border border-border bg-surface px-3 text-body-sm text-text-primary"
            value={state.sort}
            onChange={(e) => onChange({ sort: e.target.value })}
          >
            <option value="">Relevance</option>
            <option value="fee">Lowest fee</option>
            <option value="intake">Earliest intake</option>
            <option value="duration">Shortest duration</option>
          </select>
        </div>
      </div>
    </Card>
  )
}
