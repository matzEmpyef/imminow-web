import { useId, useState, type FocusEvent, type TextareaHTMLAttributes } from 'react'

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
}

// The multi-line sibling of TextField (2026-09-11, course form UI pass) — same outline, focus ring
// and notched label, so a form mixing one-line and multi-line fields reads as one set instead of
// pills with a differently-labelled box between them. The label always sits in the notch: resting
// in the middle it would cover the first line of text. `className` lands on the wrapper, as in
// TextField, so layout classes size the field rather than restyle the box.
// `error` (added 2026-09-12, product-review H1 — "make every blocked submit show WHY") mirrors
// TextField's error treatment: red border, caption below in the error color, replacing the hint
// while it's present rather than stacking both.
export function TextAreaField({
  label,
  hint,
  error,
  id,
  className,
  rows = 3,
  onFocus,
  onBlur,
  ...props
}: TextAreaFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const [focused, setFocused] = useState(false)
  const message = error ?? hint

  function handleFocus(e: FocusEvent<HTMLTextAreaElement>) {
    setFocused(true)
    onFocus?.(e)
  }

  function handleBlur(e: FocusEvent<HTMLTextAreaElement>) {
    setFocused(false)
    onBlur?.(e)
  }

  return (
    <div className={`flex flex-col gap-xs ${className ?? ''}`}>
      <div className="relative">
        <textarea
          id={fieldId}
          rows={rows}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={message ? `${fieldId}-hint` : undefined}
          className={`w-full resize-y rounded-2xl border bg-surface px-5 pb-3 pt-md text-body text-text-primary outline-none transition-colors focus:border-2 focus:border-primary ${
            error ? 'border-error' : 'border-border'
          }`}
          {...props}
        />
        <label
          htmlFor={fieldId}
          className={`pointer-events-none absolute left-5 top-0 origin-left -translate-y-1/2 scale-[0.8] bg-surface px-1 text-body ${
            focused ? 'text-primary' : 'text-text-secondary'
          }`}
        >
          {label}
          {props.required && <span className="text-required"> *</span>}
        </label>
      </div>
      {message && (
        <span id={`${fieldId}-hint`} className={`pl-lg text-caption ${error ? 'text-error' : 'text-text-secondary'}`}>
          {message}
        </span>
      )}
    </div>
  )
}
