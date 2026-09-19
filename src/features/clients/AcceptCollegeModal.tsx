import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { useUpdateApplication, type AcceptCommissionBody } from '@/queries/clients'
import { usePartnerColleges } from '@/queries/partnerColleges'
import { MONTHS } from '@/features/super-admin/courseFormShared'
import { useCurrencyCodes } from '@/lib/currencies'
import { formatMoney } from '@/lib/money'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type Application = components['schemas']['Application']
type PayerMethod = 'college' | 'applicant' | 'split'

const PAYER_LABELS: Record<PayerMethod, string> = {
  college: 'College pays',
  applicant: 'Applicant pays',
  split: 'Split — college and applicant',
}

/**
 * The Accept popup (user-specified flow, 2026-08-28): moving a college to Accepted captures the
 * money agreement that becomes the case's commission entry — this is the only place it is ever
 * entered.
 *
 * Which fields appear follows the payer method: college → the course fee prefilled, editable,
 * LOCKED to the course's own fee currency ("let it be in actual fee currency only") when it has
 * one, and an ordinary required picker when it does not; applicant → free amount + a currency
 * with no default at all (assumptions audit C5, approved 2026-09-19 — it defaulted to the
 * consultancy's own display currency, and to INR before 2026-09-10, so a Dubai agreement was
 * recorded in rupees by nobody's decision); split → both. Course start prefills from the course's
 * nearest intake and stays editable.
 *
 * Deliberately absent: the platform's rate and cut. The tiered-visibility rule (round 2, same
 * date) puts those on the Commission Details page only — the server snapshots the rate on its
 * own; the consultant agreeing fees with a student doesn't see immiNow's take here.
 *
 * Round 3 (user decision, 2026-08-28): "From college" is no longer the raw tuition — it's the
 * CONSULTANCY's commission from the college, prefilled as the Partner Colleges relation's
 * commission_percent × the course fee (still editable, in case the agreed figure differs).
 * immiNow's own cut is a % of THAT commission, not of the tuition — the arithmetic server-side
 * is unchanged, only what expected_from_college means. A college/split payer with no priced
 * relation blocks acceptance, same shape as the no-payer-method notice below.
 */
export function AcceptCollegeModal({
  clientId,
  row,
  journeyPayerMethod,
  onClose,
}: {
  clientId: string
  row: Application
  journeyPayerMethod: PayerMethod | null
  onClose: () => void
}) {
  const updateStatus = useUpdateApplication(clientId)
  const partnerColleges = usePartnerColleges()

  const course = row.course
  // No INR fallback (assumptions audit C5, approved 2026-09-19). When the course fee carries a
  // currency the college pays in it, read-only as before; when it does not, the field becomes an
  // ordinary required picker instead of silently recording a UK college's commission in rupees.
  const courseFeeCurrency = course.fee?.currency ?? ''

  // The journey's payer method, or — for a journey that never got the automatic default — the
  // Partner Colleges relation's, resolved the same way the server will at accept time.
  const relation = partnerColleges.data?.find((cc) => cc.college_id === course.college_id && cc.active !== false)
  const payerMethod: PayerMethod | null = journeyPayerMethod ?? relation?.payer_method ?? null

  // Nearest intake month, editable. Year: derived from the intake's own application_deadline
  // when there is one (2026-08-29 fix) — the deadline is authoritative about which year's
  // intake is actually still open, whereas "today vs. now" can land on the WRONG year's
  // instance of that month (e.g. defaulting Sept 2026 when the only open intake, with deadline
  // 2027-01-31, is Sept 2027). Rule: the intake year is the deadline's year, bumped one further
  // if the intake month falls before the deadline's month (an intake that opens earlier in the
  // calendar than its own deadline must be the FOLLOWING year's occurrence — e.g. a May intake
  // with a January deadline is May of deadline-year + 1, while a September intake with that same
  // January deadline is September of deadline-year itself). Falls back to the old now-based
  // heuristic when the course has no deadline data at all.
  //
  // With NO intake data at all the field starts empty and must be answered (assumptions audit
  // H18, approved 2026-09-19): the old 'September' fallback recorded a January starter as a
  // September one, and every due date on the case was then eight months out.
  const defaultMonth = course.next_intake?.month ?? course.intakes?.[0] ?? ''
  const now = new Date()
  const nextIntakeDeadline = course.next_intake?.application_deadline
  let defaultYear: number
  if (nextIntakeDeadline) {
    // UTC getters: "YYYY-MM-DD" parses as UTC midnight, and reading it back with local getters
    // can roll it back a calendar day (and occasionally a month/year) west of UTC.
    const deadlineDate = new Date(nextIntakeDeadline)
    const deadlineYear = deadlineDate.getUTCFullYear()
    const deadlineMonthIndex = deadlineDate.getUTCMonth()
    const intakeMonthIndex = MONTHS.indexOf(defaultMonth)
    defaultYear = deadlineYear + (intakeMonthIndex < deadlineMonthIndex ? 1 : 0)
  } else if (defaultMonth === '') {
    // Nothing to reason from — this year, alongside the empty month the consultant has to pick.
    defaultYear = now.getFullYear()
  } else {
    defaultYear = MONTHS.indexOf(defaultMonth) < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear()
  }

  const needsCollege = payerMethod === 'college' || payerMethod === 'split'
  const needsStudent = payerMethod === 'applicant' || payerMethod === 'split'
  // The relation's agreed % of tuition the consultancy receives from this college — required
  // for needsCollege before there is anything to prefill or accept (user decision, 2026-08-28).
  const commissionPercent = relation?.commission_percent ?? null
  const missingCommissionPercent = needsCollege && commissionPercent == null

  const [collegeAmount, setCollegeAmount] = useState('')
  const [collegeAmountTouched, setCollegeAmountTouched] = useState(false)
  const [studentAmount, setStudentAmount] = useState('')
  // The college side: locked to the course's own fee currency when it has one, editable and
  // required when it does not (C5).
  const [collegeCurrency, setCollegeCurrency] = useState(courseFeeCurrency)
  const feeCurrency = courseFeeCurrency || collegeCurrency
  // The student side has NO default at all (C5) — the consultancy's display currency is what the
  // consultant reads figures in, not what this particular student agreed to pay in, and a Dubai
  // agreement recorded in INR is wrong money on an invoice.
  const [studentCurrency, setStudentCurrency] = useState('')
  const currencyCodes = useCurrencyCodes(studentCurrency, courseFeeCurrency)
  const [startMonth, setStartMonth] = useState(defaultMonth)
  const [startYear, setStartYear] = useState(defaultYear)

  // Prefill once the relation's % and the course fee are both known — computed, not the raw
  // fee. Only while the consultant hasn't typed their own figure in.
  useEffect(() => {
    if (collegeAmountTouched || !needsCollege || commissionPercent == null || course.fee?.amount == null) return
    setCollegeAmount(String(Math.round((course.fee.amount * commissionPercent) / 100)))
  }, [collegeAmountTouched, needsCollege, commissionPercent, course.fee?.amount])

  const collegeOk = !needsCollege || (Number(collegeAmount) > 0 && feeCurrency !== '')
  const studentOk = !needsStudent || (Number(studentAmount) > 0 && studentCurrency !== '')
  const canSubmit =
    payerMethod != null && !missingCommissionPercent && collegeOk && studentOk && startMonth !== '' && !updateStatus.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const commission: AcceptCommissionBody = { course_start: { month: startMonth, year: startYear } }
    if (needsCollege) commission.expected_from_college = { amount: Number(collegeAmount), currency: feeCurrency }
    if (needsStudent) commission.expected_from_student = { amount: Number(studentAmount), currency: studentCurrency }
    updateStatus.mutate(
      { applicationId: row.id, status: 'accepted', commission },
      {
        onSuccess: () => {
          showToast(`Offer accepted for ${course.college_name ?? course.name}`)
          onClose()
        },
      },
    )
  }

  const yearOptions = [now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2, now.getFullYear() + 3]

  return (
    <Modal
      onClose={onClose}
      title="Accept Offer"
      widthRem={34}
      footer={
        <>
          {updateStatus.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateStatus.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button type="submit" form="accept-college-form" loading={updateStatus.isPending} disabled={!canSubmit}>
              Accept &amp; Record
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="accept-college-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="flex items-start justify-between gap-md">
          <div>
            <p className="text-body font-medium text-text-primary">{course.name}</p>
            <p className="text-caption text-text-secondary">
              {course.college_name}
              {course.country ? ` · ${course.country}` : ''}
            </p>
          </div>
          {payerMethod && <Badge color="info">{PAYER_LABELS[payerMethod]}</Badge>}
        </div>

        {payerMethod == null ? (
          <p className="rounded-lg bg-warning-subtle p-md text-body-sm text-warning">
            This journey has no payer method yet. Add {course.college_name ?? 'this college'} to Partner Colleges (with
            a payer method) first — the agreement can't be priced without one.
          </p>
        ) : missingCommissionPercent ? (
          <p className="rounded-lg bg-warning-subtle p-md text-body-sm text-warning">
            Set {course.college_name ?? 'this college'}&rsquo;s commission % in Partner Colleges before accepting —
            the consultancy&rsquo;s share of the tuition needs to be agreed first.
          </p>
        ) : (
          <>
            {needsCollege && (
              <div className="grid grid-cols-3 gap-sm">
                <TextField
                  label="From college (your commission)"
                  type="number"
                  min="1"
                  required
                  className="col-span-2"
                  value={collegeAmount}
                  onChange={(e) => {
                    setCollegeAmountTouched(true)
                    setCollegeAmount(e.target.value)
                  }}
                />
                {/* Locked on purpose when the course has a fee currency — the college pays in
                    it. With no course currency there is nothing to lock to, so this is an
                    ordinary required picker rather than a read-only INR (C5). */}
                {courseFeeCurrency ? (
                  <TextField label="Currency" value={courseFeeCurrency} disabled readOnly />
                ) : (
                  <SelectField
                    label="Currency"
                    required
                    value={collegeCurrency}
                    onChange={(e) => setCollegeCurrency(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {currencyCodes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </SelectField>
                )}
                {!courseFeeCurrency && (
                  <p className="col-span-3 -mt-xs text-caption text-text-secondary">
                    This course has no fee currency on record, so say which currency the college
                    agreed to pay in.
                  </p>
                )}
                {course.fee?.amount != null && courseFeeCurrency && (
                  <p className="col-span-3 -mt-xs text-caption text-text-secondary">
                    {commissionPercent}% of the {formatMoney(courseFeeCurrency, course.fee.amount)} tuition — edit if
                    the agreed figure differs.
                  </p>
                )}
              </div>
            )}
            {needsStudent && (
              <div className="grid grid-cols-3 gap-sm">
                <TextField
                  label="From applicant"
                  type="number"
                  min="1"
                  required
                  className="col-span-2"
                  value={studentAmount}
                  onChange={(e) => setStudentAmount(e.target.value)}
                />
                {/* Blank until chosen (C5) — what the applicant agreed to pay in is a fact about
                    this agreement, not a property of the consultancy's own display currency. */}
                <SelectField
                  label="Currency"
                  required
                  value={studentCurrency}
                  onChange={(e) => setStudentCurrency(e.target.value)}
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
              {/* Empty and required when the course lists no intakes (assumptions audit H18,
                  approved 2026-09-19) — see `defaultMonth` above. */}
              <SelectField
                label="Course starts"
                required
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              >
                <option value="">Select…</option>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Year" value={startYear} onChange={(e) => setStartYear(Number(e.target.value))}>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </SelectField>
            </div>
            {defaultMonth === '' && (
              <p className="-mt-xs text-caption text-text-secondary">
                This course lists no intake months, so say when this student actually starts — the case&rsquo;s due
                dates are counted from it.
              </p>
            )}
            <p className="text-caption text-text-secondary">
              Accepting is final for this case — one accepted college per student. A mistake can be undone with
              &ldquo;Change acceptance&rdquo;, which records a reason in the audit log.
            </p>
          </>
        )}
      </form>
    </Modal>
  )
}
