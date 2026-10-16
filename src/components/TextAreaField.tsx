import { useId, useState, type ChangeEvent, type FocusEvent, type TextareaHTMLAttributes } from 'react'
import { CharCounter } from '@/components/CharCounter'
import {
  COUNTER_FROM,
  TEXT_RULES,
  charLength,
  checkText,
  clipChars,
  stripControlChars,
  type TextKind,
} from '@/lib/validation'

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
  /**
   * What the text is (Phase 9, decision 154): a reason or note (3 to 2000 characters; a legal
   * erasure reason at least 20), long text (up to 5000, the default), or chat (up to 4000). It
   * gives the field its limit, the counter near the limit and the kind's one sentence once the
   * field is left. A form's own `error` always wins.
   */
  kind?: Extract<TextKind, 'reason' | 'erasureReason' | 'note' | 'longText' | 'chat' | 'title' | 'label'>
  /** Characters allowed (code points), when the kind's own limit is not the right one. */
  limit?: number
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
  kind = 'longText',
  limit: limitProp,
  maxLength,
  value,
  onFocus,
  onBlur,
  onChange,
  ...props
}: TextAreaFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const [focused, setFocused] = useState(false)
  const [touched, setTouched] = useState(false)
  const limit = limitProp ?? maxLength ?? TEXT_RULES[kind].max
  const text = typeof value === 'string' ? value : ''
  const count = charLength(text)
  // What is typed, judged once the field has been left, unless the form has its own sentence.
  const autoError = touched && text !== '' ? checkText(kind, text, { optional: true }) : undefined
  const shownError = error ?? autoError
  const message = shownError ?? hint

  function handleFocus(e: FocusEvent<HTMLTextAreaElement>) {
    setFocused(true)
    onFocus?.(e)
  }

  function handleBlur(e: FocusEvent<HTMLTextAreaElement>) {
    setFocused(false)
    setTouched(true)
    onBlur?.(e)
  }

  // Stops at the limit (counted in characters) and drops control characters; line breaks stay.
  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = clipChars(stripControlChars(e.target.value), limit)
    if (next !== e.target.value) e.target.value = next
    onChange?.(e)
  }

  return (
    <div className={`flex flex-col gap-xs ${className ?? ''}`}>
      <div className="relative">
        <textarea
          id={fieldId}
          rows={rows}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          aria-invalid={Boolean(shownError)}
          aria-describedby={message ? `${fieldId}-hint` : undefined}
          className={`w-full resize-y rounded-2xl border bg-surface px-5 pb-3 pt-md text-body text-text-primary outline-none transition-colors focus:border-2 focus:border-primary ${
            shownError ? 'border-error' : 'border-border'
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
      {(message || count >= limit * COUNTER_FROM) && (
        <div className="flex items-start">
          {message && (
            <span
              id={`${fieldId}-hint`}
              className={`pl-lg text-caption ${shownError ? 'text-error' : 'text-text-secondary'}`}
            >
              {message}
            </span>
          )}
          <CharCounter id={`${fieldId}-count`} count={count} limit={limit} />
        </div>
      )}
    </div>
  )
}
