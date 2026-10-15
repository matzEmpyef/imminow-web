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
  askPayments,
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
  /**
   * True when the admission is asked and the case has money recorded on it (or the server did not
   * say it has none): the second question, shown only while the first is answered Yes.
   */
  askPayments?: boolean
}) {
  const headingId = useId()
  const admissionId = useId()
  const paymentsId = useId()
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
        <YesNo
          id={admissionId}
          question="Does the admission go to the new consultancy too?"
          answer={Boolean(value.admission)}
          // Saying No to the admission also takes the money answer back to No.
          onAnswer={(answer) =>
            onChange({ ...value, admission: answer, recorded_payments: answer ? Boolean(value.recorded_payments) : false })
          }
          helper={
            value.admission
              ? 'The new consultancy takes over the accepted college and its commission from now on.'
              : "The accepted college stays with the first consultancy, and immiNow's share of that admission becomes due from it now."
          }
        />
      )}
      {askAdmission && askPayments && value.admission && (
        <YesNo
          id={paymentsId}
          question="Does the money already recorded on this admission go too?"
          answer={Boolean(value.recorded_payments)}
          onAnswer={(answer) => onChange({ ...value, recorded_payments: answer })}
          helper="If yes, the payments already recorded move to the new consultancy, and it owes immiNow's share on all of them. If no, the first consultancy still owes the share on what it has already received."
        />
      )}
      <p className="text-caption text-text-secondary">The plan, internal notes and commission records never move.</p>
    </fieldset>
  )
}

/** A required Yes/No question with a line under it that explains the answer chosen. */
function YesNo({
  id,
  question,
  answer,
  onAnswer,
  helper,
}: {
  id: string
  question: string
  answer: boolean
  onAnswer: (answer: boolean) => void
  helper: string
}) {
  return (
    <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-xs">
      <p id={id} className="text-body-sm font-medium text-text-primary">
        {question}
      </p>
      <div className="flex items-center gap-lg">
        {[
          { label: 'Yes', checked: true },
          { label: 'No', checked: false },
        ].map((option) => (
          <label key={option.label} className="flex items-center gap-xs text-body-sm text-text-primary">
            <input
              type="radio"
              name={id}
              required
              checked={answer === option.checked}
              onChange={() => onAnswer(option.checked)}
              className="h-4 w-4 shrink-0 border-border"
            />
            {option.label}
          </label>
        ))}
      </div>
      <p className="text-caption text-text-secondary">{helper}</p>
    </div>
  )
}
