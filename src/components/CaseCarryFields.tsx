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
  askAdmission,
}: {
  value: CaseCarry
  onChange: (next: CaseCarry) => void
  disabled?: boolean
  /**
   * True when a college has already accepted the student: the person moving the case must also say
   * whether the admission goes to the new consultancy (DECISIONS 117 C-9 and 118). Left out
   * everywhere else (Transfer Applicant refuses a case with an accepted college).
   */
  askAdmission?: boolean
}) {
  const headingId = useId()
  const admissionId = useId()
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
      {askAdmission && (
        <div role="radiogroup" aria-labelledby={admissionId} className="flex flex-col gap-xs">
          <p id={admissionId} className="text-body-sm font-medium text-text-primary">
            Does the admission go to the new consultancy too?
          </p>
          <div className="flex items-center gap-lg">
            {[
              { label: 'Yes', checked: true },
              { label: 'No', checked: false },
            ].map((option) => (
              <label key={option.label} className="flex items-center gap-xs text-body-sm text-text-primary">
                <input
                  type="radio"
                  name={admissionId}
                  required
                  checked={Boolean(value.admission) === option.checked}
                  onChange={() => onChange({ ...value, admission: option.checked })}
                  className="h-4 w-4 shrink-0 border-border"
                />
                {option.label}
              </label>
            ))}
          </div>
          <p className="text-caption text-text-secondary">
            {"If not, the accepted college stays with the first consultancy and immiNow's share of that admission becomes due from it now."}
          </p>
        </div>
      )}
      <p className="text-caption text-text-secondary">The plan, internal notes and commission records never move.</p>
    </fieldset>
  )
}
