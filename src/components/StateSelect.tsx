import { useId } from 'react'
import { useStates } from '@/queries/countries'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'

interface StateSelectProps {
  label: string
  country: string
  value: string
  onChange: (value: string) => void
  className?: string
  // See CountrySelect for the 'pill' vs 'compact' split — same reasoning applies here.
  size?: 'pill' | 'compact'
  required?: boolean
  disabled?: boolean
}

/**
 * Single-select dropdown sourced from GET /countries/{name}/states (2026-09-15) — the ONE managed
 * list per country every state field now reads and is checked against. Free-text state entry used
 * to let a campus, institution or partner location store a spelling nothing else would ever match;
 * the server refuses anything off this list, so the picker keeps the console from ever offering a
 * value the API would then reject.
 *
 * Modelled closely on {@link CountrySelect} — same props shape, same 'pill'/'compact' split, same
 * "stored value not on the list" handling — with one addition: it depends on `country`, so it has
 * three more states CountrySelect doesn't: no country chosen yet, loading, and a country with no
 * subdivisions at all (Hong Kong).
 */
export function StateSelect({
  label,
  country,
  value,
  onChange,
  className,
  size = 'pill',
  required,
  disabled,
}: StateSelectProps) {
  const states = useStates(country || undefined)
  const selectId = useId()

  const knownStates = states.data?.map((s) => s.name) ?? []
  const noCountry = !country
  const loading = !noCountry && states.isLoading
  const failed = !noCountry && states.isError
  // Hong Kong etc. — the country exists but has no subdivisions, so the server does not check the
  // field either. Typed rather than disabled: the campus form REQUIRES a state, and a disabled
  // empty picker would make a campus there impossible to save.
  const noStatesForCountry = !noCountry && !loading && !failed && knownStates.length === 0
  if (noStatesForCountry) {
    return (
      <TextField
        label={label}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={className}
      />
    )
  }
  const isDisabled = disabled || noCountry || loading || failed

  const placeholder = noCountry
    ? 'Pick a country first'
    : loading
      ? 'Loading…'
      : failed
        ? 'Couldn’t load the states — try again'
        : 'Select…'

  // Same idea as CountrySelect's "(not offered)" — a record set before the list existed, or set
  // to a spelling the server later stopped recognising, must still show as a value rather than a
  // blank "Select…" (which would read as "empty" when it plainly isn't).
  const storedButUnlisted = value && !knownStates.includes(value) ? value : null

  const options = (
    <>
      <option value="">{placeholder}</option>
      {storedButUnlisted && (
        <option value={storedButUnlisted}>{storedButUnlisted} (not on the list)</option>
      )}
      {knownStates.map((name) => (
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
        className={`h-10 rounded-md border border-border bg-surface px-3 text-body text-text-primary outline-none focus:border-2 focus:border-primary disabled:opacity-60 ${className ?? ''}`}
      >
        {options}
      </select>
    </div>
  )
}
