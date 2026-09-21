import type { ReactNode } from 'react'
import { CountrySelect } from '@/components/CountrySelect'
import { StateSelect } from '@/components/StateSelect'
import { DistrictSelect } from '@/components/DistrictSelect'
import { TextField } from '@/components/TextField'
import {
  DISTRICT_REQUIRED_COUNTRY,
  branchLocationErrors,
  type BranchLocationDraft,
} from './branchLocation'

interface BranchPlaceFieldsProps {
  /** The heading above the group — "Where this branch is", "Where the head office is". */
  heading: string
  value: BranchLocationDraft
  onChange: (next: BranchLocationDraft) => void
  /**
   * Errors appear only once a save has been attempted — the console's convention everywhere, so a
   * form does not start out shouting at fields nobody has reached yet.
   */
  showErrors: boolean
  /**
   * Prefixes every label ("Office country", "Office city"). For a form that ALREADY has a Country
   * and a City of its own: Create Consultancy captures the account's city and country in the same
   * dialog, and two controls labelled "City" is an ambiguous form and an ambiguous accessible name.
   * Omitted, the labels are the bare "Country" / "State" / "District" / "City".
   */
  labelPrefix?: string
  /** Shown inside the city box when leaving it empty still fills it in server-side. */
  cityPlaceholder?: string
  /** The sentence under the group — why the place matters on THIS form. */
  caption: ReactNode
}

/**
 * The four levels of a branch's place — country, state, district, city — with the cascade that
 * keeps them consistent, shared by the branch form and Create Consultancy's head office
 * (2026-09-21).
 *
 * ONE COPY, deliberately. `POST /consultancies` gained `branch_country` / `branch_state` /
 * `branch_district` / `branch_city` validated by the very same server function `PATCH
 * /staff/branches` uses, India district rule included — so a second set of pickers in the create
 * modal would be two consoles for one server rule, and the rule that drifts is the one nobody
 * looks at twice. The validation itself lives in `branchLocation.ts` and is shared the same way.
 *
 * The cascade lives HERE rather than in each caller: each level belongs to the one above it, so
 * keeping a state across a country change, or a district across a state change, would carry a
 * value the new list has never heard of straight into the server's 422.
 */
export function BranchPlaceFields({
  heading,
  value,
  onChange,
  showErrors,
  labelPrefix,
  cityPlaceholder,
  caption,
}: BranchPlaceFieldsProps) {
  const errors = branchLocationErrors(value)
  const label = (field: string) =>
    labelPrefix ? `${labelPrefix} ${field.toLowerCase()}` : field

  function changeCountry(next: string) {
    if (next === value.country) return
    onChange({ ...value, country: next, state: '', district: '' })
  }

  function changeState(next: string) {
    if (next === value.state) return
    onChange({ ...value, state: next, district: '' })
  }

  return (
    <div className="flex flex-col gap-sm">
      <p className="text-body-sm font-medium text-text-primary">{heading}</p>
      <div className="grid grid-cols-2 items-start gap-sm">
        <CountrySelect label={label('Country')} value={value.country} onChange={changeCountry} />
        <StateSelect
          label={label('State')}
          country={value.country}
          value={value.state}
          onChange={changeState}
          required={Boolean(value.country)}
        />
      </div>
      {showErrors && errors.state && <p className="text-caption text-error">{errors.state}</p>}
      <div className="grid grid-cols-2 items-start gap-sm">
        <DistrictSelect
          label={label('District')}
          country={value.country}
          state={value.state}
          value={value.district}
          onChange={(district) => onChange({ ...value, district })}
          required={value.country === DISTRICT_REQUIRED_COUNTRY}
          error={showErrors ? errors.district : undefined}
        />
        {/* City stays free text, the same call the job form made: there is no managed world city
            list, and a city is one rung below what the managed lists cover. */}
        <TextField
          label={label('City')}
          value={value.city}
          placeholder={cityPlaceholder}
          onChange={(e) => onChange({ ...value, city: e.target.value })}
        />
      </div>
      <p className="text-caption text-text-secondary">{caption}</p>
    </div>
  )
}
