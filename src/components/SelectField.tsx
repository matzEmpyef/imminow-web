import { useId, type SelectHTMLAttributes, type ReactNode } from 'react'

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  children: ReactNode
}

/**
 * A dropdown that lines up with {@link TextField}.
 *
 * Added 2026-08-23 (user: "wherever there is a dropdown next to textbox, make sure the alignment
 * is correct"). Every select in this console was hand-rolled as a `FieldLabel` line ABOVE an
 * `h-10 rounded-md px-3` control, while TextField is `h-12 rounded-full px-5` with its label
 * FLOATING INSIDE the field and no line above it at all. Put the two side by side and they can
 * never agree: different heights, different corner radius, different padding, and one carries a
 * label row the other doesn't. That last part is why nudging margins never fixed it — the columns
 * genuinely have a different number of rows.
 *
 * So this mirrors TextField's structure exactly rather than approximating it: same wrapper, same
 * `gap-xs`, same 48px pill, same floated label notching the border, same error line underneath.
 * `className` lands on the WRAPPER for the same reason it does there — width and flex sizing are
 * layout concerns and belong on the outer element, not spliced into the control's own classes.
 *
 * The label is ALWAYS floated, unlike TextField's rest state. A select is never visually empty —
 * it shows either a chosen option or a placeholder one — so a centred label would collide with
 * that text instead of sitting where the value goes.
 */
export function SelectField({ label, error, id, className, children, ...props }: SelectFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId

  return (
    <div className={`flex flex-col gap-xs ${className ?? ''}`}>
      <div className="relative">
        <select
          id={fieldId}
          // pr-10 leaves room for the native chevron so a long option label never runs under it.
          className={`h-12 w-full appearance-none rounded-full border bg-surface px-5 pr-10 text-body text-text-primary outline-none transition-colors focus:border-2 focus:border-primary ${
            error ? 'border-error' : 'border-border'
          }`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          {...props}
        >
          {children}
        </select>
        <label
          htmlFor={fieldId}
          className="pointer-events-none absolute left-5 top-0 origin-left -translate-y-1/2 scale-[0.8] bg-surface px-1 text-body text-text-secondary"
        >
          {label}
          {props.required && <span className="text-required"> *</span>}
        </label>
        {/* `appearance-none` above removes the platform chevron, so draw one — otherwise the field
            reads as a text input until you tap it. */}
        <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-text-secondary">
          <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
            <path d="M5.5 7.5 10 12l4.5-4.5H5.5Z" />
          </svg>
        </span>
      </div>
      {error && (
        <span id={`${fieldId}-error`} className="pl-lg text-caption text-error">
          {error}
        </span>
      )}
    </div>
  )
}
