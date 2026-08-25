import type { ReactNode } from 'react'

// Shared label for the many hand-rolled `<select>`/`<textarea>`/custom-picker fields across the
// admin forms that don't go through TextField (which renders its own `required` marker) —
// same tomato `*` convention, same visual weight (user-requested, 2026-08-18 — "mark in with a
// red (tomato color) * (across platform)," replacing "(optional)" suffixes). Unmarked = optional.
export function FieldLabel({
  children,
  required,
  htmlFor,
}: {
  children: ReactNode
  required?: boolean
  htmlFor?: string
}) {
  return (
    <label className="text-body-sm font-medium text-text-primary" htmlFor={htmlFor}>
      {children}
      {required && <span className="text-required"> *</span>}
    </label>
  )
}
