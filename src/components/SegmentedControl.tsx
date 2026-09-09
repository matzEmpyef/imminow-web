import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** One line under the label — for choices where the label alone doesn't say what changes. */
  description?: string
  icon?: ReactNode
}

interface SegmentedControlProps<T extends string> {
  /** Announced as the group's name; also rendered above the control unless `hideLabel`. */
  label: string
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  hideLabel?: boolean
  disabled?: boolean
  className?: string
}

/**
 * A two-or-three-way structural choice, rendered as one control rather than a dropdown.
 *
 * The distinction from `SelectField` is what the choice DOES: a select picks a value, this picks
 * which form you are filling in. Create Account uses it twice — consultancy vs. institute, and
 * invite-a-new-admin vs. attach-an-existing-login (INSTITUTE_ACCOUNT_PLAN D8's two mutually
 * exclusive request forms, which the server refuses if both or neither arrive). Both are branches
 * where the fields below change, and a collapsed dropdown hides that consequence behind a click.
 *
 * `role="radiogroup"` rather than a tab list: tabs reveal panels of the same thing, these are
 * alternatives, and only one is submitted.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  hideLabel,
  disabled,
  className,
}: SegmentedControlProps<T>) {
  const withDescription = options.some((o) => o.description)
  return (
    <div className={`flex flex-col gap-xs ${className ?? ''}`}>
      {!hideLabel && <p className="text-body-sm font-medium text-text-primary">{label}</p>}
      <div
        role="radiogroup"
        aria-label={label}
        className={`grid gap-sm ${options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`flex flex-col rounded-md border px-md text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                withDescription ? 'gap-0.5 py-sm' : 'py-sm'
              } ${
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-text-secondary hover:border-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="flex items-center gap-xs text-body-sm font-medium">
                {option.icon}
                {option.label}
              </span>
              {option.description && (
                <span className={`text-caption ${selected ? 'text-primary' : 'text-text-secondary'}`}>
                  {option.description}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
