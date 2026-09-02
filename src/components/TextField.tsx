import { useId, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  valid?: boolean
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
  id,
  className,
  value,
  type,
  onFocus,
  onBlur,
  onChange,
  ...props
}: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hasStatus = Boolean(error) || valid
  const isPassword = type === 'password'
  const isEmail = type === 'email'
  const [focused, setFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const floated = focused || Boolean(value)
  const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type
  const iconCount = (hasStatus ? 1 : 0) + (isPassword ? 1 : 0)

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    setFocused(true)
    onFocus?.(e)
  }

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    setFocused(false)
    onBlur?.(e)
  }

  // Email fields are always lowercase, platform-wide (user, 2026-08-24) — forced here at the
  // shared component rather than at each of the 11 call sites, and as the user types rather than
  // only on blur/submit, so what's on screen always matches what gets sent. An email's local part
  // is conventionally treated as case-insensitive and the domain always is, so lowercasing loses
  // nothing real while closing off an entire class of "same account, different casing" bugs (a
  // login/signup/email-change mismatch) at the one point all of them originate from — typed input.
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (isEmail) e.target.value = e.target.value.toLowerCase()
    onChange?.(e)
  }

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
            error ? 'border-error' : 'border-border'
          } ${iconCount === 1 ? 'pr-11' : iconCount === 2 ? 'pr-16' : ''}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : undefined}
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
            {error ? (
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
      {error && (
        <span id={`${fieldId}-error`} className="pl-lg text-caption text-error">
          {error}
        </span>
      )}
    </div>
  )
}
