import { useId } from 'react'
import { useDistricts } from '@/queries/countries'
import { SelectField } from '@/components/SelectField'
import { FieldLabel } from '@/components/FieldLabel'

interface DistrictSelectProps {
  label: string
  country: string
  state: string
  value: string
  onChange: (value: string) => void
  className?: string
  // See CountrySelect for the 'pill' vs 'compact' split — same reasoning applies here.
  size?: 'pill' | 'compact'
  required?: boolean
  disabled?: boolean
  /** Validation message under the control — same contract as TextField/SelectField/CountrySelect. */
  error?: string
}

/**
 * Single-select dropdown sourced from GET /countries/{name}/states/{state}/districts (2026-09-21)
 * — the third rung of the same managed place hierarchy {@link CountrySelect} and {@link StateSelect}
 * already cover, added because a branch's district is what the student's "nearest branch" ranking
 * sorts on after city. The server refuses a district its state's list does not have, so the picker
 * exists to make sure the console never offers a spelling the API would then reject.
 *
 * Modelled on StateSelect, which it depends on the same way StateSelect depends on CountrySelect,
 * with ONE behaviour StateSelect deliberately does not share: when the list comes back EMPTY this
 * does NOT fall back to a free-text field.
 *
 * StateSelect falls back because a country with no subdivisions (Hong Kong) still has a state field
 * the campus form requires, and a disabled empty picker would make a campus there impossible to
 * save. Districts are the opposite case: only India models them, so an empty list means "this
 * country has no districts", and the server then refuses ANY district for that state — every value
 * is off a list with nothing on it. A text box there would invite a 422 on every keystroke's worth
 * of typing. So it stays a disabled select saying so in words.
 */
export function DistrictSelect({
  label,
  country,
  state,
  value,
  onChange,
  className,
  size = 'pill',
  required,
  disabled,
  error,
}: DistrictSelectProps) {
  const districts = useDistricts(country || undefined, state || undefined)
  const selectId = useId()

  const knownDistricts = districts.data?.map((d) => d.name) ?? []
  const noState = !country || !state
  const loading = !noState && districts.isLoading
  const failed = !noState && districts.isError
  const noDistrictsForState = !noState && !loading && !failed && knownDistricts.length === 0
  const isDisabled = disabled || noState || loading || failed || noDistrictsForState

  const placeholder = noState
    ? 'Pick a state first'
    : loading
      ? 'Loading…'
      : failed
        ? 'Couldn’t load the districts — try again'
        : noDistrictsForState
          ? `Not used in ${country}`
          : 'Select…'

  // Same idea as CountrySelect's "(not offered)" and StateSelect's "(not on the list)" — a branch
  // filled in before the list was compiled, or against a district since merged away (Indian
  // district boundaries change every year, which the contract says outright), must still read as a
  // stored value rather than a blank "Select…".
  const storedButUnlisted = value && !knownDistricts.includes(value) ? value : null

  const options = (
    <>
      <option value="">{placeholder}</option>
      {storedButUnlisted && <option value={storedButUnlisted}>{storedButUnlisted} (not on the list)</option>}
      {knownDistricts.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </>
  )

  if (size === 'pill') {
    return (
      <SelectField
        label={label}
        required={required}
        error={error}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isDisabled}
        className={className}
      >
        {options}
      </SelectField>
    )
  }

  return (
    <div className="flex flex-col gap-xs">
      <FieldLabel htmlFor={selectId} required={required}>
        {label}
      </FieldLabel>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isDisabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={`h-10 rounded-md border bg-surface px-3 text-body text-text-primary outline-none focus:border-2 focus:border-primary disabled:opacity-60 ${
          error ? 'border-error' : 'border-border'
        } ${className ?? ''}`}
      >
        {options}
      </select>
      {error && (
        <span id={`${selectId}-error`} className="text-caption text-error">
          {error}
        </span>
      )}
    </div>
  )
}
