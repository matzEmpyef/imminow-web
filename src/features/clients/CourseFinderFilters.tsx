import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { MultiSelect } from '@/components/MultiSelect'
import { Toggle } from '@/components/Toggle'
import { FilterChip } from '@/components/FilterChip'
import { SearchSelect } from '@/components/SearchSelect'
import { CompactSelect } from '@/components/CompactSelect'
import { useCourseFields, useCourseLevels, useCourseLanguages } from '@/queries/courseFinder'
import { useCountries } from '@/queries/countries'
import { useMyConsultancy } from '@/queries/consultancy'
import { courseLevelLabel } from '@/lib/studyLevels'
import type { usePersonPicker } from '@/lib/usePersonPicker'
import {
  DURATION_BUCKETS,
  INTAKE_OPTIONS,
  STUDY_MODE_OPTIONS,
  DELIVERY_OPTIONS,
  type FinderState,
} from './courseFinderState'

interface CourseFinderFiltersProps {
  state: FinderState
  onChange: (patch: Partial<FinderState>) => void
  clientRows: ReturnType<typeof usePersonPicker>['clientRows']
  leadRows: ReturnType<typeof usePersonPicker>['leadRows']
  onPersonChange: (personId: string, kind: 'client' | 'lead') => void
  canCheckFit: boolean
  /** First name of the selected applicant/lead, for the eligibility toggle's label. */
  personName: string | undefined
  /** An institute lists only its own courses (H4, 2026-09-13) — no country, no conversion note. */
  isInstitute?: boolean
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
  isInstitute = false,
}: CourseFinderFiltersProps) {
  const { data: fields } = useCourseFields()
  const { data: levels } = useCourseLevels()
  const { data: languages } = useCourseLanguages()
  // The same source CountrySelect itself reads from (user-requested: "all countries fields
  // should be linked to this countries table") — Country widened to a MultiSelect (2026-09-18)
  // still needs the identical list, not a second copy of it.
  const countries = useCountries()
  // The consultancy's own currency (2026-09-10) — the same one CourseFinderPage sends as
  // filter[fee_currency]; a cached read, so the second call costs nothing.
  const feeCurrency = useMyConsultancy().data?.display_currency ?? 'INR'

  // "More filters" disclosure (2026-09-18) — Country/Fee/Duration plus the eight facets below
  // (province/state, city, intake, study mode, delivery, language, five perk flags) would no
  // longer fit the Card's existing calm two-row shape, and most searches never touch most of
  // them. `null` means "no explicit choice yet" — the panel opens itself when a value already
  // set (a restored cache, or a shared-search link) lives in it, but a manual click always wins
  // after that, so collapsing it back never gets silently re-opened by the state it was
  // collapsing.
  const [moreOpenOverride, setMoreOpenOverride] = useState<boolean | null>(null)
  const hasMoreFiltersSet =
    Boolean(
      state.provinceState ||
        state.city ||
        state.intake ||
        state.studyMode ||
        state.delivery ||
        state.language,
    ) ||
    state.scholarship ||
    state.coop ||
    state.psw ||
    state.appFeeWaived ||
    state.openNow
  const moreOpen = moreOpenOverride ?? hasMoreFiltersSet

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
        {/* The catalogue's own levels (console review M14, 2026-09-13) — the hardcoded four here
            could neither drop a rung this caller's catalogue has none of nor offer one it has
            gained, and the same list elsewhere in the console offered 10th/11th/12th, which no
            course is ever filed under. */}
        <SelectField
          id="cf-level"
          label="Level"
          value={state.level}
          onChange={(e) => onChange({ level: e.target.value })}
        >
          <option value="">Any level</option>
          {(levels ?? []).map((level) => (
            <option key={level} value={level}>
              {courseLevelLabel(level)}
            </option>
          ))}
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
        {/* Multi-select (2026-09-18) — parity with the Sentpo app's own Countries card, so a
            search shared from the app keeps every country it named instead of dropping all but
            the first under "Not carried over: Other countries (...)". Same options list
            CountrySelect itself reads from; same MultiSelect idiom Field of study already uses. */}
        {!isInstitute && (
          <MultiSelect
            label="Country"
            options={countries.data ?? []}
            selected={state.countries}
            onChange={(next) => onChange({ countries: next })}
          />
        )}
        <div className="flex flex-col gap-xs">
          <TextField
            label={`Max fee (${feeCurrency})`}
            type="number"
            value={state.feeMax}
            onChange={(e) => onChange({ feeMax: e.target.value })}
            placeholder="Any"
          />
          {/* Rates are set by hand, not live (user, 2026-09-10) — say so, since the margin can let
              in a course that looks a little over the figure typed. An institute's own courses are
              all priced in its own currency, so there is nothing to convert. */}
          {!isInstitute && (
            <p className="text-caption text-text-secondary">
              Courses priced in another currency are converted, with a small margin as rates change.
            </p>
          )}
        </div>
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

      {/* "More filters" disclosure (2026-09-18) — the rest of the app's search vocabulary
          (province/state, city, intake, study mode, delivery, language, and five perk flags).
          Collapsed by default so an ordinary search still sees the same calm two-row Card as
          before; it opens itself when one of these already has a value (a restored cache, or a
          search shared from the app that named one of them), so nothing hides an active filter
          from the consultant who set it. */}
      <button
        type="button"
        onClick={() => setMoreOpenOverride(!moreOpen)}
        className="mt-md flex items-center gap-xs text-body-sm font-medium text-primary hover:underline"
        aria-expanded={moreOpen}
      >
        {moreOpen ? 'Fewer filters' : 'More filters'}
        {moreOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {moreOpen && (
        <>
          <div className="mt-md grid grid-cols-1 gap-md md:grid-cols-4">
            <TextField
              label="Province or state"
              value={state.provinceState}
              onChange={(e) => onChange({ provinceState: e.target.value })}
              placeholder="Any"
            />
            <TextField label="City" value={state.city} onChange={(e) => onChange({ city: e.target.value })} placeholder="Any" />
            <SelectField
              id="cf-intake"
              label="Intake"
              value={state.intake}
              onChange={(e) => onChange({ intake: e.target.value })}
            >
              <option value="">Any intake</option>
              {Object.entries(INTAKE_OPTIONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="cf-study-mode"
              label="Study mode"
              value={state.studyMode}
              onChange={(e) => onChange({ studyMode: e.target.value })}
            >
              <option value="">Any</option>
              {Object.entries(STUDY_MODE_OPTIONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="mt-md grid grid-cols-1 gap-md md:grid-cols-4">
            <SelectField
              id="cf-delivery"
              label="Delivery"
              value={state.delivery}
              onChange={(e) => onChange({ delivery: e.target.value })}
            >
              <option value="">Any</option>
              {Object.entries(DELIVERY_OPTIONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="cf-language"
              label="Language"
              value={state.language}
              onChange={(e) => onChange({ language: e.target.value })}
            >
              <option value="">Any language</option>
              {(languages ?? []).map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </SelectField>
          </div>

          {/* The five "true only when set" perk flags (Highlights + Applications open on mobile's
              own filter sheet) — FilterChip, not Toggle: each one only ever NARROWS the list, the
              exact case FilterChip's own doc comment reserves it for. */}
          <div className="mt-md flex flex-wrap gap-sm">
            <FilterChip
              label="Scholarship"
              active={state.scholarship}
              onChange={(scholarship) => onChange({ scholarship })}
            />
            <FilterChip label="Co-op" active={state.coop} onChange={(coop) => onChange({ coop })} />
            <FilterChip label="Post-study work" active={state.psw} onChange={(psw) => onChange({ psw })} />
            <FilterChip
              label="Application fee waived"
              active={state.appFeeWaived}
              onChange={(appFeeWaived) => onChange({ appFeeWaived })}
            />
            <FilterChip
              label="Open for applications"
              active={state.openNow}
              onChange={(openNow) => onChange({ openNow })}
            />
          </div>
        </>
      )}

      <div className="mt-md flex flex-wrap items-center justify-between gap-md">
        {/* Only meaningful with an applicant: with nobody to compare against, every course
            has no verdict and the switch would filter nothing while looking like it should.
            The old label ("Hide below-requirement courses") described the MECHANISM; the
            user reported not understanding it (2026-08-23), so it now names the person and
            the effect, with the consequence spelled out underneath. */}
        {canCheckFit ? (
          <div className="flex flex-col gap-0.5">
            {/* The Toggle only carries an aria-label, so the switch showed with no visible text;
                the label now sits beside it and is clickable too (2026-09-10). */}
            <div className="flex items-center gap-sm">
              <Toggle
                id="cf-eligible"
                checked={state.eligibleOnly}
                onChange={(eligibleOnly) => onChange({ eligibleOnly })}
                label={`Only show courses ${personName} qualifies for`}
              />
              <label htmlFor="cf-eligible" className="cursor-pointer text-body-sm font-medium text-text-primary">
                Only show courses {personName} qualifies for
              </label>
            </div>
            {/* Indented to start under the label text, not under the switch. */}
            <p className="text-caption text-text-secondary" style={{ paddingLeft: '3.25rem' }}>
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
          <CompactSelect
            id="cf-sort"
            label="Sort"
            value={state.sort}
            onChange={(e) => onChange({ sort: e.target.value })}
          >
            <option value="">Relevance</option>
            <option value="fee">Lowest fee</option>
            <option value="intake">Earliest intake</option>
            <option value="duration">Shortest duration</option>
          </CompactSelect>
        </div>
      </div>
    </Card>
  )
}
