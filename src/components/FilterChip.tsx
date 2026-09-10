import { Check } from 'lucide-react'

interface FilterChipProps {
  label: string
  active: boolean
  onChange: (active: boolean) => void
}

/**
 * A quick filter that narrows a list, shown as a pill you press on and off (user, 2026-09-10:
 * "all the check boxes in Client list and active leads table... need better UX").
 *
 * It replaced a row of bare checkboxes, which had two problems. A checkbox is a form control, so
 * a filter bar of them read like a settings form rather than a way to slice a list. And an ON
 * filter looked almost the same as an OFF one, a 16px tick mark among equal-weight labels, so
 * a narrowed table read as if it were the whole list. A pressed pill carries its state across the
 * whole control: tinted, bordered in the brand colour, and ticked.
 *
 * Small (h-8) and on the Table's second filter row, below search and the dropdowns: these are
 * quick toggles, secondary to finding and picking values, and the smaller size says so.
 * `aria-pressed` makes it a toggle button to a screen reader, which is what it is.
 *
 * For NARROWING filters only. Anything that WIDENS the list ("include closed") is a different kind
 * of choice and uses a Toggle switch instead, so the two never look like the same thing.
 */
export function FilterChip({ label, active, onChange }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onChange(!active)}
      className={`flex h-8 items-center gap-xs rounded-full border px-3 text-caption font-medium transition-colors ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-background text-text-secondary hover:border-text-secondary hover:text-text-primary'
      }`}
    >
      {active && <Check className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </button>
  )
}
