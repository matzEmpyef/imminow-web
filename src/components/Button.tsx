import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive'
  size?: 'sm' | 'md'
  loading?: boolean
}

// ui-ux-design-web.md Section 5: filled Primary / outlined Secondary / filled Error
// (destructive), fully rounded. Disabled state is opacity-only — never a separate treatment.
const variantClasses = {
  primary: 'bg-primary text-text-on-primary shadow-card hover:opacity-90',
  secondary: 'border border-border bg-surface text-text-primary hover:bg-background',
  destructive: 'bg-error text-text-on-primary shadow-card hover:opacity-90',
} as const

// Defaults to `type="button"` (fixed 2026-08-18, found via "remove button delete icon - confirm
// on deletion") — a native `<button>` with no explicit type defaults to `type="submit"`, so any
// Button placed inside a `<form>` without deliberately passing `type="button"` silently submits
// that form on click. QuizAdminPage's new Position Prize confirm-remove Modal (Cancel *and*
// Remove, since both are plain Buttons) sits inside QuizSettingsModal's `<form>`, so clicking
// either one submitted and closed the whole outer Quiz Details form instead of just dismissing
// the confirm popup. Every genuine submit button in this codebase already opts in explicitly with
// `type="submit"` (confirmed via grep — 47 occurrences, all explicit), so this default is safe:
// it only changes behavior for buttons that were never meant to submit anything.
// `sm` exists for dense contexts (e.g. Table.tsx's pagination controls) that don't want the
// default touch-target-sized button.
const sizeClasses = {
  md: 'h-10 px-5 text-button',
  sm: 'h-8 px-3 text-caption',
} as const

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-full font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses[size]} ${variantClasses[variant]} ${className ?? ''}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}
