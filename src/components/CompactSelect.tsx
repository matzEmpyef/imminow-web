import { type ReactNode, type SelectHTMLAttributes } from 'react'

interface CompactSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /**
   * Accessible name. Compact selects live in toolbars and table cells where there is no room for
   * a visible label, so the name is mandatory here precisely BECAUSE it is invisible — the
   * hand-rolled selects this replaces each had to remember their own `aria-label`, and the audit
   * kept finding ones that hadn't.
   */
  label: string
  /** Table-cell density: h-8 + caption type instead of the toolbar's h-10 + body-sm. */
  dense?: boolean
  children: ReactNode
}

/**
 * {@link SelectField}'s toolbar/cell-density sibling (2026-09-02).
 *
 * SelectField is deliberately a 48px pill with a floating label — a FORM control, matched to
 * TextField. That shape physically cannot sit in a Table's filter bar or inside a row, which is
 * why ~28 selects across the console stayed hand-rolled after the SelectField sweep: they weren't
 * refusing the component, they were refusing the density. This is the same control at toolbar
 * density, so those sites get one source of truth for border, focus and type instead of each
 * carrying its own class string.
 *
 * Kept to the native platform chevron (no `appearance-none`) on purpose: it is what every
 * hand-rolled toolbar select already rendered, so converting a site changes nothing visually.
 * `className` is APPENDED for layout concerns (width, capitalize); sizing stays owned by `dense`
 * so two competing height utilities never end up on one element — the exact collision class the
 * max-w lint guard exists for.
 */
export function CompactSelect({ label, dense = false, className, children, ...props }: CompactSelectProps) {
  return (
    <select
      aria-label={label}
      className={`${dense ? 'h-8 text-caption' : 'h-10 text-body-sm'} rounded-md border border-border bg-background px-3 text-text-primary outline-none transition-colors focus:border-primary ${className ?? ''}`}
      {...props}
    >
      {children}
    </select>
  )
}
