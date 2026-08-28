import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { useUpdateSelectedCollege, type AcceptCommissionBody } from '@/queries/clients'
import { usePartnerColleges } from '@/queries/partnerColleges'
import { MONTHS, CURRENCIES } from '@/features/super-admin/courseFormShared'
import type { components } from '@/api/schema'

type SelectedCollege = components['schemas']['SelectedCollege']
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
 * LOCKED to the course's own fee currency ("let it be in actual fee currency only"); applicant →
 * free amount + currency, INR by default; split → both. Course start prefills from the course's
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
  row: SelectedCollege
  journeyPayerMethod: PayerMethod | null
  onClose: () => void
}) {
  const updateStatus = useUpdateSelectedCollege(clientId)
  const partnerColleges = usePartnerColleges()

  const course = row.course
  const feeCurrency = course.fee?.currency ?? 'INR'

  // The journey's payer method, or — for a journey that never got the automatic default — the
  // Partner Colleges relation's, resolved the same way the server will at accept time.
  const relation = partnerColleges.data?.find((cc) => cc.college_id === course.college_id && cc.active !== false)
  const payerMethod: PayerMethod | null = journeyPayerMethod ?? relation?.payer_method ?? null

  // Nearest intake month, editable. Year heuristic: if that month has already passed this year,
  // the nearest occurrence is next year's.
  const defaultMonth = course.next_intake?.month ?? course.intakes?.[0] ?? 'September'
  const now = new Date()
  const defaultYear = MONTHS.indexOf(defaultMonth) < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear()

  const needsCollege = payerMethod === 'college' || payerMethod === 'split'
  const needsStudent = payerMethod === 'applicant' || payerMethod === 'split'
  // The relation's agreed % of tuition the consultancy receives from this college — required
  // for needsCollege before there is anything to prefill or accept (user decision, 2026-08-28).
  const commissionPercent = relation?.commission_percent ?? null
  const missingCommissionPercent = needsCollege && commissionPercent == null

  const [collegeAmount, setCollegeAmount] = useState('')
  const [collegeAmountTouched, setCollegeAmountTouched] = useState(false)
  const [studentAmount, setStudentAmount] = useState('')
  const [studentCurrency, setStudentCurrency] = useState('INR')
  const [startMonth, setStartMonth] = useState(defaultMonth)
  const [startYear, setStartYear] = useState(defaultYear)

  // Prefill once the relation's % and the course fee are both known — computed, not the raw
  // fee. Only while the consultant hasn't typed their own figure in.
  useEffect(() => {
    if (collegeAmountTouched || !needsCollege || commissionPercent == null || course.fee?.amount == null) return
    setCollegeAmount(String(Math.round((course.fee.amount * commissionPercent) / 100)))
  }, [collegeAmountTouched, needsCollege, commissionPercent, course.fee?.amount])

  const collegeOk = !needsCollege || Number(collegeAmount) > 0
  const studentOk = !needsStudent || Number(studentAmount) > 0
  const canSubmit = payerMethod != null && !missingCommissionPercent && collegeOk && studentOk && !updateStatus.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const commission: AcceptCommissionBody = { course_start: { month: startMonth, year: startYear } }
    if (needsCollege) commission.expected_from_college = { amount: Number(collegeAmount), currency: feeCurrency }
    if (needsStudent) commission.expected_from_student = { amount: Number(studentAmount), currency: studentCurrency }
    updateStatus.mutate({ collegeId: row.id, status: 'accepted', commission }, { onSuccess: onClose })
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
                {/* Locked on purpose — the college pays in the course's own fee currency. */}
                <TextField label="Currency" value={feeCurrency} disabled readOnly />
                {course.fee?.amount != null && (
                  <p className="col-span-3 -mt-1 text-caption text-text-secondary">
                    {commissionPercent}% of the {course.fee.amount.toLocaleString()} {feeCurrency} tuition — edit if
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
                <SelectField label="Currency" value={studentCurrency} onChange={(e) => setStudentCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
            <div className="grid grid-cols-2 gap-sm">
              <SelectField label="Course starts" value={startMonth} onChange={(e) => setStartMonth(e.target.value)}>
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
