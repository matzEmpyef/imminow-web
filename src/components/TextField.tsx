import { useId, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from 'react'
import { CharCounter } from '@/components/CharCounter'
import {
  DATETIME_MAX,
  DATETIME_MIN,
  DATE_MAX,
  DATE_MIN,
  DEFAULT_LINE_MAX,
  PASSWORD_MAX,
  COUNTER_FROM,
  charLength,
  clipChars,
  dateError,
  fieldKindError,
  fieldKindLimit,
  numberRangeError,
  stripControlChars,
  type FieldKind,
  type FieldKindOptions,
} from '@/lib/validation'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement>, FieldKindOptions {
  label: string
  error?: string
  valid?: boolean
  // Helper text under the field; the error replaces it while there is one.
  hint?: string
  /**
   * What the field holds (Phase 9, decision 154): it gets the kind's character limit, a counter
   * near the limit and the kind's one sentence when what is typed does not fit (shown once the
   * field is left; a form's own `error` always wins). An email, phone, web-address or search
   * input gets its kind from its `type`.
   */
  kind?: FieldKind
  /** Characters allowed (code points), when the kind's own limit is not the right one. */
  limit?: number
}

// ui-ux-design-web.md Section 5: pill-shaped field, 1px Border at rest, 2px Primary when
// focused, inline validation icon, error text below in Error color, 48px height. The label
// floats: centered inside the field at rest, rising to "notch" the top border (bg-surface
// behind it cuts the border line) once the field is focused or filled. Driven by React state
// rather than a CSS-only `:placeholder-shown` peer trick — tried that first, but Tailwind v4
// wasn't generating any rule for the arbitrary `peer-[&:not(:placeholder-shown)]` variant in
// this project's setup (confirmed via document.styleSheets — zero matching rules emitted), so
// explicit state is the reliable choice here, not a style preference.
//
// `className` is applied to the root wrapper, not the `<input>` (fixed 2026-08-17 — "Earn Rules
// UI is broken around points and caps"). A same-day-earlier fix hardcoded the wrapper to `w-full`
// to make `flex-1` sizing work for TextFields inside a horizontal flex row (Quiz's per-option
// row, ConsultancyProfilePage's "New tag" row, CountriesPage's "New country" row) — but that
// broke every OTHER horizontal-row usage that instead passes `max-w-[Nrem]` to stay narrow
// (EarnRulesPage's Points/Cap fields, CreateQuizForm's PrizeEditor Position/Bonus-points fields):
// `className` still only reached the `<input>`, so the now-forced-`w-full` wrapper ignored the
// max-width entirely and every field tried to claim the full row. The actual root cause was
// `className` landing on the wrong element for a *layout* concern (width/flex sizing belongs on
// the outer wrapper, not spliced into the input's own hardcoded visual classes) — moving it there
// fixes both directions at once: `flex-1`/`w-full` now grows the wrapper as intended, and
// `max-w-[Nrem]` now actually constrains it. No hardcoded `w-full` needed either — a wrapper with
// no className falls back to the parent's default cross-axis stretch in a vertical `flex flex-col`
// form, which is how it already looked everywhere before any of this.
// `required` (native HTML attribute, already flowed through `...props` onto the `<input>`) now
// also renders a tomato `*` after the label (user-requested, 2026-08-18 — "mark in with a red
// (tomato color) * (across platform)," replacing the old convention of writing "(optional)" next
// to every non-required field instead). Unmarked fields are optional by default; only fields that
// are genuinely required pass `required`.
export function TextField({
  label,
  error,
  valid,
  hint,
  id,
  className,
  value,
  type,
  kind: kindProp,
  limit: limitProp,
  phoneRegion,
  codeRange,
  countMin,
  countMax,
  maxLength,
  onFocus,
  onBlur,
  onChange,
  ...props
}: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const isPassword = type === 'password'
  const isEmail = type === 'email'
  const kind: FieldKind | undefined =
    kindProp ??
    (isEmail ? 'email' : type === 'tel' ? 'phone' : type === 'url' ? 'url' : type === 'search' ? 'search' : undefined)
  const isTextual =
    type === undefined || type === 'text' || type === 'email' || type === 'tel' || type === 'url' || type === 'search'
  const kindOptions: FieldKindOptions = { phoneRegion, codeRange, countMin, countMax }
  // No one-line field is left without a ceiling: its kind's limit, or 200 when it names none.
  const limit =
    limitProp ??
    maxLength ??
    (isPassword ? PASSWORD_MAX : kind ? fieldKindLimit(kind, kindOptions) : undefined) ??
    (isTextual ? DEFAULT_LINE_MAX : undefined)
  const [focused, setFocused] = useState(false)
  const [touched, setTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // A field with placeholder text keeps its label floated even when empty (2026-09-10): a label
  // resting in the middle sat ON TOP of the placeholder ("Search" over "Course or college" read as
  // "Search or college"). Floated, it matches the selects beside it, whose labels always float.
  const floated = focused || Boolean(value) || Boolean(props.placeholder)
  const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    setFocused(true)
    onFocus?.(e)
  }

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    setFocused(false)
    setTouched(true)
    onBlur?.(e)
  }

  // Email fields are always lowercase, platform-wide (user, 2026-08-24) — forced here at the
  // shared component rather than at each of the 11 call sites, and as the user types rather than
  // only on blur/submit, so what's on screen always matches what gets sent. An email's local part
  // is conventionally treated as case-insensitive and the domain always is, so lowercasing loses
  // nothing real while closing off an entire class of "same account, different casing" bugs (a
  // login/signup/email-change mismatch) at the one point all of them originate from — typed input.
  // The same place stops a text running past its limit (counted in characters, so an emoji or a
  // Hindi letter with its vowel sign is one, not two), drops control characters (a NUL cannot be
  // saved) and turns a code into capitals as it is typed.
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (isPassword && limit !== undefined) {
      // A password keeps every character it has, spaces included; it only stops at its ceiling.
      const clipped = clipChars(e.target.value, limit)
      if (clipped !== e.target.value) e.target.value = clipped
    } else if (isTextual) {
      let next = e.target.value
      if (isEmail) next = next.toLowerCase()
      if (kind === 'code') next = next.toUpperCase()
      next = stripControlChars(next)
      if (limit !== undefined) next = clipChars(next, limit)
      if (next !== e.target.value) e.target.value = next
    }
    onChange?.(e)
  }

  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  const lengthNow = charLength(text)
  const isDate = type === 'date' || type === 'datetime-local'
  const isNumber = type === 'number'
  // What is typed, judged once the field has been left, unless the form has its own sentence.
  const autoError =
    touched && text !== ''
      ? isDate
        ? dateError(text)
        : isNumber
          ? kind === 'percent' || kind === 'count'
            ? fieldKindError(kind, text, {
                ...kindOptions,
                countMin: countMin ?? numberOrUndefined(props.min),
                countMax: countMax ?? numberOrUndefined(props.max),
              })
            : numberRangeError(text, props.min, props.max)
          : kind
            ? fieldKindError(kind, text, kindOptions)
            : undefined
      : undefined
  const shownError = error ?? autoError
  const hasStatus = Boolean(shownError) || valid
  const iconCount = (hasStatus ? 1 : 0) + (isPassword ? 1 : 0)
  const dateBounds = !isDate
    ? {}
    : type === 'date'
      ? { min: props.min ?? DATE_MIN, max: props.max ?? DATE_MAX }
      : { min: props.min ?? DATETIME_MIN, max: props.max ?? DATETIME_MAX }
  const numberBounds =
    kind === 'percent'
      ? { min: props.min ?? 0, max: props.max ?? 100, step: props.step ?? '0.01' }
      : kind === 'count'
        ? { step: props.step ?? 1 }
        : {}
  const counterId = `${fieldId}-count`

  return (
    <div className={`flex flex-col gap-xs ${className ?? ''}`}>
      <div className="relative">
        <input
          id={fieldId}
          value={value}
          type={resolvedType}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          className={`h-12 w-full rounded-full border bg-surface px-5 text-body text-text-primary outline-none transition-colors focus:border-2 focus:border-primary ${
            shownError ? 'border-error' : 'border-border'
          } ${iconCount === 1 ? 'pr-11' : iconCount === 2 ? 'pr-16' : ''}`}
          aria-invalid={Boolean(shownError)}
          aria-describedby={shownError ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...dateBounds}
          {...numberBounds}
          {...props}
        />
        <label
          htmlFor={fieldId}
          className={`pointer-events-none absolute left-5 origin-left -translate-y-1/2 bg-surface px-1 text-body transition-all ${
            floated ? 'top-0 scale-[0.8]' : 'top-1/2 scale-100'
          } ${focused ? 'text-primary' : 'text-text-secondary'}`}
        >
          {label}
          {props.required && <span className="text-required"> *</span>}
        </label>
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            // Visible focus ring (keyboard pass, 2026-09-03): this was the one control on Login a
            // keyboard user could land on with no indication that they had.
            className={`absolute top-1/2 -translate-y-1/2 rounded-sm text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              hasStatus ? 'right-11' : 'right-4'
            }`}
          >
            {showPassword ? (
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                <path d="M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10Zm7.5 3a3 3 0 100-6 3 3 0 000 6Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                <path d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.86-1.86c1.73-1.32 2.9-3 3.53-4.13a1.5 1.5 0 0 0 0-1.46C17.9 6.9 14.98 4.5 10 4.5c-1.47 0-2.72.28-3.78.72L3.28 2.22Zm4.9 4.9 1.4 1.4a3 3 0 0 1 3.6 3.6l1.4 1.4a4.5 4.5 0 0 0-6.4-6.4ZM10 15.5c-4.98 0-7.9-2.4-9.41-4.95a1.5 1.5 0 0 1 0-1.5 15.8 15.8 0 0 1 3.06-3.7l1.07 1.06a14.3 14.3 0 0 0-2.66 3.19C3.35 11.85 5.79 14 10 14c.6 0 1.16-.04 1.68-.13l1.2 1.2c-.87.28-1.83.43-2.88.43Z" />
              </svg>
            )}
          </button>
        )}
        {hasStatus && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
            {shownError ? (
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-error">
                <path d="M10 2a8 8 0 100 16 8 8 0 000-16Zm1 11H9v-2h2v2Zm0-4H9V5h2v4Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-success">
                <path d="M8.5 13.5 4.8 9.8l1.4-1.4L8.5 10.7l5.3-5.3 1.4 1.4-6.7 6.7Z" />
              </svg>
            )}
          </span>
        )}
      </div>
      {(shownError || hint || (limit !== undefined && lengthNow >= limit * COUNTER_FROM)) && (
        <div className="flex items-start">
          {shownError ? (
            <span id={`${fieldId}-error`} className="pl-lg text-caption text-error">
              {shownError}
            </span>
          ) : hint ? (
            <span id={`${fieldId}-hint`} className="pl-lg text-caption text-text-secondary">
              {hint}
            </span>
          ) : null}
          {limit !== undefined && <CharCounter id={counterId} count={lengthNow} limit={limit} />}
        </div>
      )}
    </div>
  )
}

function numberOrUndefined(value: string | number | undefined): number | undefined {
  if (value === undefined || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}
