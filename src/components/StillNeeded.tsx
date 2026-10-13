/**
 * The line beside a greyed-out button that says what is missing (T4-14). A button that is off for
 * no visible reason reads as broken, so every form that switches its button off until something is
 * filled in names that something, in the footer next to the button. Nothing is shown once nothing
 * is missing.
 */
export function StillNeeded({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null
  return (
    <p className="mr-auto self-center text-body-sm text-text-secondary" role="status">
      Still needed: {items.join(', ')}.
    </p>
  )
}
