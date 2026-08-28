import { useState, type FormEvent } from 'react'
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
 * own; the consultant agreeing fees with a student doesn't see Sentpo's take here.
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

  const [collegeAmount, setCollegeAmount] = useState(course.fee?.amount != null ? String(course.fee.amount) : '')
  const [studentAmount, setStudentAmount] = useState('')
  const [studentCurrency, setStudentCurrency] = useState('INR')
  const [startMonth, setStartMonth] = useState(defaultMonth)
  const [startYear, setStartYear] = useState(defaultYear)

  const needsCollege = payerMethod === 'college' || payerMethod === 'split'
  const needsStudent = payerMethod === 'applicant' || payerMethod === 'split'
  const collegeOk = !needsCollege || Number(collegeAmount) > 0
  const studentOk = !needsStudent || Number(studentAmount) > 0
  const canSubmit = payerMethod != null && collegeOk && studentOk && !updateStatus.isPending

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
        ) : (
          <>
            {needsCollege && (
              <div className="grid grid-cols-3 gap-sm">
                <TextField
                  label="From college"
                  type="number"
                  min="1"
                  required
                  className="col-span-2"
                  value={collegeAmount}
                  onChange={(e) => setCollegeAmount(e.target.value)}
                />
                {/* Locked on purpose — the college pays in the course's own fee currency. */}
                <TextField label="Currency" value={feeCurrency} disabled readOnly />
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
