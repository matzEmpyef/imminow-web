import { useId } from 'react'
import { useCountries } from '@/queries/countries'
import { SelectField } from '@/components/SelectField'
import { FieldLabel } from '@/components/FieldLabel'

interface CountrySelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
  // 'pill' (default) delegates to SelectField, which mirrors TextField exactly — for forms where
  // this field sits next to TextFields. 'compact' keeps the h-10/rounded-md native <select> style
  // admin toolbar filters use (e.g. Commission Rates' Consultancy/Payer method selects), where
  // there is no TextField to line up with and a shorter control reads better in a dense toolbar.
  size?: 'pill' | 'compact'
  required?: boolean
  disabled?: boolean
}

/**
 * Single-select dropdown sourced from the shared countries list (user-requested: "all countries
 * fields should be linked to this countries table"). Plain native `<select>` rather than
 * MultiSelect's chips-and-search UI — campus country, destination country and partner location
 * each only ever hold one value.
 *
 * The 'pill' size now DELEGATES to {@link SelectField} instead of re-approximating it. It used to
 * render its own label ABOVE the control while claiming to match TextField, which it could never
 * do: TextField floats its label INSIDE the field, so this column always carried one more row than
 * the columns beside it and sat 23px lower. Measured on Course Finder, 2026-08-23 — three
 * TextFields at y=276 and both dropdowns at y=299 in the same grid row. Matching a shared
 * primitive by copying its numbers is how they drift; using it is how they don't.
 */
export function CountrySelect({
  label,
  value,
  onChange,
  className,
  size = 'pill',
  required,
  disabled,
}: CountrySelectProps) {
  const countries = useCountries()
  const selectId = useId()
  const options = (
    <>
      <option value="">Select…</option>
      {countries.data?.map((country) => (
        <option key={country} value={country}>
          {country}
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
        disabled={disabled}
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
        disabled={disabled}
        className={`h-10 rounded-md border border-border bg-surface px-3 text-body text-text-primary outline-none focus:border-2 focus:border-primary disabled:opacity-60 ${className ?? ''}`}
      >
        {options}
      </select>
    </div>
  )
}
