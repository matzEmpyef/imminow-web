import type { ReactNode } from 'react'
import { MoneyField } from '@/components/MoneyField'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { MONTHS } from '@/features/super-admin/courseFormShared'
import type { CommissionAmounts } from '@/lib/commissionAmounts'
import { useCurrencyCodes } from '@/lib/currencies'

/**
 * The Accept popup's money fields: what the college pays, what the student pays, and when the
 * course starts. One component, used by the Accept popup itself and by the consultancy moves that
 * take the admission along (Support's switch, Applicant Allocation), so the amounts are entered the
 * same way everywhere. The caller holds the value and says which sides apply.
 *
 * The college side is locked to the course's own fee currency when there is one
 * (`courseFeeCurrency`); with none it is an ordinary picker. The student side has no default
 * currency at all (assumptions audit C5, 2026-09-19).
 */
export function CommissionAmountFields({
  value,
  onChange,
  needsCollege,
  needsStudent,
  courseFeeCurrency = '',
  collegeLabel = 'From college (your commission)',
  studentLabel = 'From applicant',
  amountsRequired = true,
  collegeMessage,
  studentMessage,
  collegeCurrencyNote,
  collegeNote,
  noIntakeNote,
  disabled,
}: {
  value: CommissionAmounts
  onChange: (next: CommissionAmounts) => void
  needsCollege: boolean
  needsStudent: boolean
  courseFeeCurrency?: string
  collegeLabel?: string
  studentLabel?: string
  /** False when each amount is optional on its own (a moved admission: the server says which apply). */
  amountsRequired?: boolean
  collegeMessage?: string
  studentMessage?: string
  /** Said under the college side while there is no course fee currency to lock it to. */
  collegeCurrencyNote?: string
  /** Extra caption under the college side (the Accept popup's commission suggestion). */
  collegeNote?: ReactNode
  /** The course lists no intake months: say why the start must be chosen. */
  noIntakeNote?: boolean
  disabled?: boolean
}) {
  const currencyCodes = useCurrencyCodes(value.studentCurrency, courseFeeCurrency || value.collegeCurrency)
  const set = (patch: Partial<CommissionAmounts>) => onChange({ ...value, ...patch })
  // Five years out, not three (assumptions audit M39, product owner 2026-09-19): a deferred offer
  // or a long programme start four years away must be recordable.
  const thisYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 6 }, (_, i) => thisYear + i)
  return (
    <>
      {needsCollege && (
        <div className="grid grid-cols-3 gap-sm">
          <MoneyField
            label={collegeLabel}
            required={amountsRequired}
            disabled={disabled}
            className="col-span-2"
            value={value.collegeAmount}
            onChange={(e) => set({ collegeAmount: e.target.value })}
            error={collegeMessage}
          />
          {/* Locked on purpose when the course has a fee currency — the college pays in it. With no
              course currency there is nothing to lock to, so this is an ordinary required picker
              rather than a read-only INR (C5). */}
          {courseFeeCurrency ? (
            <TextField label="Currency" value={courseFeeCurrency} disabled readOnly />
          ) : (
            <SelectField
              label="Currency"
              required={amountsRequired}
              disabled={disabled}
              value={value.collegeCurrency}
              onChange={(e) => set({ collegeCurrency: e.target.value })}
            >
              <option value="">Select…</option>
              {currencyCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
          )}
          {!courseFeeCurrency && collegeCurrencyNote && (
            <p className="col-span-3 -mt-xs text-caption text-text-secondary">{collegeCurrencyNote}</p>
          )}
          {collegeNote}
        </div>
      )}
      {needsStudent && (
        <div className="grid grid-cols-3 gap-sm">
          <MoneyField
            label={studentLabel}
            required={amountsRequired}
            disabled={disabled}
            className="col-span-2"
            value={value.studentAmount}
            onChange={(e) => set({ studentAmount: e.target.value })}
            error={studentMessage}
          />
          {/* Blank until chosen (C5) — what the student agreed to pay in is a fact about this
              agreement, not a property of the consultancy's own display currency. */}
          <SelectField
            label="Currency"
            required={amountsRequired}
            disabled={disabled}
            value={value.studentCurrency}
            onChange={(e) => set({ studentCurrency: e.target.value })}
          >
            <option value="">Select…</option>
            {currencyCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      <div className="grid grid-cols-2 gap-sm">
        {/* Empty and required when the course lists no intakes (assumptions audit H18, approved
            2026-09-19). */}
        <SelectField
          label="Course starts"
          required
          disabled={disabled}
          value={value.startMonth}
          onChange={(e) => set({ startMonth: e.target.value })}
        >
          <option value="">Select…</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Year"
          disabled={disabled}
          value={value.startYear}
          onChange={(e) => set({ startYear: Number(e.target.value) })}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </SelectField>
      </div>
      {noIntakeNote && (
        <p className="-mt-xs text-caption text-text-secondary">
          This course lists no intake months, so say when this student actually starts — the case&rsquo;s due dates are
          counted from it.
        </p>
      )}
    </>
  )
}
