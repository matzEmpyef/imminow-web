import { useId } from 'react'
import { CARRY_ITEMS, type CaseCarry } from '@/lib/caseCarry'

/**
 * "What moves with the case" — the four tick boxes shown wherever a case is moved to another
 * consultancy: the consultancy's own Transfer Applicant, Support Tools' Switch consultancy and
 * Applicant Allocation's change rows (owner's ruling on review I-014, 2026-10-08). One component
 * so all three ask the same question in the same words. The caller holds the value (start it at
 * `DEFAULT_CARRY`) and sends all four keys.
 */
export function CaseCarryFields({
  value,
  onChange,
  disabled,
}: {
  value: CaseCarry
  onChange: (next: CaseCarry) => void
  disabled?: boolean
}) {
  const headingId = useId()
  return (
    <fieldset aria-labelledby={headingId} disabled={disabled} className="flex flex-col gap-sm">
      <div className="flex flex-col gap-xs">
        <p id={headingId} className="text-body-sm font-medium text-text-primary">
          What moves with the case
        </p>
        <p className="text-caption text-text-secondary">
          Choose what the new consultancy receives. The student is told what was shared.
        </p>
      </div>
      <div className="flex flex-col gap-sm rounded-md border border-border p-sm">
        {CARRY_ITEMS.map((item) => (
          <label key={item.key} className="flex items-start gap-sm text-body-sm text-text-primary">
            <input
              type="checkbox"
              checked={value[item.key]}
              onChange={(e) => onChange({ ...value, [item.key]: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
            />
            <span className="text-text-secondary">
              <span className="font-medium text-text-primary">{item.label}</span> — {item.helper}
            </span>
          </label>
        ))}
      </div>
      <p className="text-caption text-text-secondary">The plan, internal notes and commission records never move.</p>
    </fieldset>
  )
}
