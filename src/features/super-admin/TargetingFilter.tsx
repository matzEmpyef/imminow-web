import type { Targeting } from '@/lib/targeting'
import { useInstitutions, institutionLabel } from '@/queries/institutions'
import { MultiSelect } from '@/components/MultiSelect'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { STUDY_LEVELS, studyLevelLabel, type StudyLevel } from '@/lib/studyLevels'
import { GENDERS, genderLabel, type Gender } from '@/lib/genders'


interface TargetingFilterProps {
  value: Targeting
  onChange: (next: Targeting) => void
  /** Country names for the two country pickers — pass `useCountries().data ?? []`. */
  countries: string[]
  /**
   * What happens to a student who has not filled in a targeted field. This is display-only — the
   * server decides it per surface — but the operator has to know which one they are authoring,
   * because the same filter reaches a different audience on an ad than on a broadcast.
   */
  unknownDataPolicy: 'includes' | 'excludes'
}

/**
 * THE targeting filter. One component for ads, quizzes and broadcasts (user-requested 2026-08-27:
 * "We need the same filter in all the targeting part").
 *
 * Before this, each surface had its own controls and its own subset of fields: ads offered five,
 * broadcasts three, and quizzes had no targeting UI at all despite the data model supporting it.
 * Both surfaces that DID offer study level shipped it as `options={[]}` with `allowCustom`, so the
 * control suggested nothing and accepted anything — which is how values no filter could match got
 * stored in the first place.
 *
 * Adding a dimension now means adding it here once, and all three surfaces get it.
 */
export function TargetingFilter({ value, onChange, countries, unknownDataPolicy }: TargetingFilterProps) {
  const institutions = useInstitutions()
  // Keyed by id, labelled "Name — City": two schools share the name "The Choice School", so a
  // label without its city would make the two rows indistinguishable in this list.
  const institutionById = new Map((institutions.data?.items ?? []).map((i) => [i.id, institutionLabel(i)]))
  // Every field is optional in the contract, so a patch merges onto whatever is already set.
  const set = (patch: Partial<Targeting>) => onChange({ ...value, ...patch })

  // Empty arrays and empty strings are indistinguishable from "no restriction" to the server, but
  // sending `[]` rather than omitting is noise in the stored object — normalize on the way out.
  const list = (next: string[]) => (next.length > 0 ? next : undefined)

  const ageError =
    value.min_age != null && value.max_age != null && value.min_age > value.max_age
      ? 'Minimum age is above the maximum, so this matches nobody.'
      : undefined

  return (
    <div className="flex flex-col gap-sm">
      <p className="text-caption text-text-secondary">
        Leave a field empty to not restrict on it. Within a field the values are any-of; across fields they combine, so
        the audience is everyone matching all of them.{' '}
        {unknownDataPolicy === 'excludes'
          ? 'A student who has not filled in a targeted field is EXCLUDED here — a push notification cannot be un-received.'
          : 'A student who has not filled in a targeted field is still INCLUDED here, so an unanswered wizard never empties the slot.'}
      </p>

      <div className="flex flex-col gap-xs">
        <MultiSelect
          label="Country of residence"
          options={countries}
          selected={value.resident_country ?? []}
          onChange={(next) => set({ resident_country: list(next) })}
        />
        <p className="text-caption text-text-secondary">
          Where they live now. Use this for anything that only exists somewhere — a walk-in office, a city event, a
          local offer.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-sm">
        <MultiSelect
          label="Province / state"
          options={[]}
          selected={value.state ?? []}
          onChange={(next) => set({ state: list(next) })}
          allowCustom
        />
        <MultiSelect
          label="District / county"
          options={[]}
          selected={value.district ?? []}
          onChange={(next) => set({ district: list(next) })}
          allowCustom
        />
        <MultiSelect
          label="City"
          options={[]}
          selected={value.city ?? []}
          onChange={(next) => set({ city: list(next) })}
          allowCustom
        />
      </div>
      <p className="text-caption text-text-secondary">
        Free text on both sides — these must match what the student typed in their profile, so a spelling that differs
        matches nobody rather than erroring.
      </p>

      <div className="flex flex-col gap-xs">
        <MultiSelect
          label="Target country"
          options={countries}
          selected={value.target_country ?? []}
          onChange={(next) => set({ target_country: list(next) })}
        />
        <p className="text-caption text-text-secondary">Where they want to study — not where they live.</p>
      </div>

      <div className="flex flex-col gap-xs">
        <MultiSelect
          label="School / college"
          options={(institutions.data?.items ?? []).map((i) => i.id)}
          selected={value.institution_id ?? []}
          onChange={(next) => set({ institution_id: list(next) })}
          renderLabel={(id) => institutionById.get(id) ?? id}
        />
        <p className="text-caption text-text-secondary">
          The student&rsquo;s own school or college in India — not a destination abroad. Students whose typed-in school
          is still awaiting staff mapping have no id yet, so they are unknown on this dimension.
        </p>
      </div>

      <MultiSelect
        label="Study level"
        options={STUDY_LEVELS}
        selected={value.study_level ?? []}
        // Closed to STUDY_LEVELS with no allowCustom, so every value the control can emit is a
        // StudyLevel and the assertion is sound.
        onChange={(next) => set({ study_level: list(next) as StudyLevel[] | undefined })}
        renderLabel={studyLevelLabel}
      />

      <div className="grid grid-cols-2 gap-sm">
        <SelectField
          label="Stage"
          id="targeting-stage"
          value={value.stage == null ? '' : String(value.stage)}
          onChange={(e) => set({ stage: e.target.value ? (Number(e.target.value) as 1 | 2) : null })}
        >
          <option value="">Any stage</option>
          <option value="1">Stage 1 — Leads</option>
          <option value="2">Stage 2 — Clients</option>
        </SelectField>
        <SelectField
          label="Case type"
          id="targeting-case-type"
          value={value.case_type ?? ''}
          onChange={(e) => set({ case_type: (e.target.value || null) as Targeting['case_type'] })}
        >
          <option value="">Any case type</option>
          <option value="student">Student</option>
          <option value="pr">PR</option>
        </SelectField>
      </div>

      <div className="grid grid-cols-3 gap-sm">
        <TextField
          label="Minimum age"
          id="targeting-min-age"
          type="number"
          value={value.min_age == null ? '' : String(value.min_age)}
          onChange={(e) => set({ min_age: e.target.value === '' ? null : Number(e.target.value) })}
        />
        <TextField
          label="Maximum age"
          id="targeting-max-age"
          type="number"
          value={value.max_age == null ? '' : String(value.max_age)}
          onChange={(e) => set({ max_age: e.target.value === '' ? null : Number(e.target.value) })}
        />
        <SelectField
          label="Gender"
          id="targeting-gender"
          value={value.gender ?? ''}
          onChange={(e) => set({ gender: (e.target.value || null) as Gender | null })}
        >
          <option value="">Any gender</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {genderLabel(g)}
            </option>
          ))}
        </SelectField>
      </div>
      {ageError && <p className="text-caption text-error">{ageError}</p>}
    </div>
  )
}
