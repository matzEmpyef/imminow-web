import { hasTooManyDecimals, serverMoneyMessage } from '@/lib/moneyInput'
import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { CommissionAmountFields } from '@/components/CommissionAmountFields'
import { commissionBody, emptyAmounts } from '@/lib/commissionAmounts'
import { useCommissionSuggestion, useUpdateApplication } from '@/queries/clients'
import { usePartnerColleges } from '@/queries/partnerColleges'
import { NotPartnerNotice } from './NotPartnerNotice'
import { useAccountWords } from '@/lib/accountWords'
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
 *
 * THE SUGGESTION IS THE SERVER'S (review F-300, 2026-10-10). The figure comes from
 * `GET /clients/{id}/commission-suggestion` (fee x percent / 100, at two decimals) and is shown as
 * served; nothing is multiplied or rounded here. When the server offers nothing (null) the box
 * starts empty. It fills the box only while the consultant has not typed a figure of their own.
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
  const { isInstitute } = useAccountWords()
  // No INR fallback (assumptions audit C5, approved 2026-09-19). When the course fee carries a
  // currency the college pays in it, read-only as before; when it does not, the field becomes an
  // ordinary required picker instead of silently recording a UK college's commission in rupees.
  const courseFeeCurrency = course.fee?.currency ?? ''

  // The journey's payer method, or — for a journey that never got the automatic default — the
  // Partner Colleges relation's, resolved the same way the server will at accept time.
  const relation = partnerColleges.data?.find((cc) => cc.college_id === course.college_id && cc.active !== false)
  const payerMethod: PayerMethod | null = journeyPayerMethod ?? relation?.payer_method ?? null
  // The server refuses an acceptance from a college that is not a Partner College; say so first.
  const notPartner = !isInstitute && partnerColleges.data !== undefined && !relation

  // Nearest intake month and its year, editable: see `defaultCourseStart` for the rule.
  const defaultMonth = emptyAmounts(course).startMonth

  const needsCollege = payerMethod === 'college' || payerMethod === 'split'
  const needsStudent = payerMethod === 'applicant' || payerMethod === 'split'
  // The relation's agreed % of tuition the consultancy receives from this college — required
  // for needsCollege before there is anything to prefill or accept (user decision, 2026-08-28).
  const commissionPercent = relation?.commission_percent ?? null
  const missingCommissionPercent = needsCollege && commissionPercent == null

  const [amounts, setAmounts] = useState(() => emptyAmounts(course))
  const [collegeAmountTouched, setCollegeAmountTouched] = useState(false)
  // The college side: locked to the course's own fee currency when it has one, editable and
  // required when it does not (C5).
  const feeCurrency = courseFeeCurrency || amounts.collegeCurrency

  // The server's suggestion for this course. It is only an offer: it fills the box while the
  // consultant has not typed a figure of their own, so one that arrives late never overwrites it.
  const suggestion = useCommissionSuggestion(clientId, course.id, needsCollege)
  const suggested = suggestion.data?.expected_from_college?.amount
  useEffect(() => {
    if (collegeAmountTouched || !needsCollege || suggested == null) return
    setAmounts((current) => ({ ...current, collegeAmount: suggested.toFixed(2) }))
  }, [collegeAmountTouched, needsCollege, suggested])

  const collegeOk = !needsCollege || (Number(amounts.collegeAmount) > 0 && !hasTooManyDecimals(amounts.collegeAmount) && feeCurrency !== '')
  const studentOk = !needsStudent || (Number(amounts.studentAmount) > 0 && !hasTooManyDecimals(amounts.studentAmount) && amounts.studentCurrency !== '')
  // The server's own sentences for the amounts, when it refused one (`details.fields`).
  const collegeMessage = serverMoneyMessage(updateStatus.error, 'expected_from_college.amount')
  const studentMessage = serverMoneyMessage(updateStatus.error, 'expected_from_student.amount')
  const canSubmit =
    payerMethod != null && !notPartner && !missingCommissionPercent && collegeOk && studentOk && amounts.startMonth !== '' && !updateStatus.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const commission = commissionBody(amounts, { college: needsCollege, student: needsStudent }, courseFeeCurrency)
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

  return (
    <Modal
      onClose={onClose}
      title="Accept Offer"
      widthRem={34}
      footer={
        <>
          {updateStatus.isError && !collegeMessage && !studentMessage && (
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

        {notPartner ? (
          <NotPartnerNotice
            collegeName={course.college_name}
            className="rounded-lg bg-warning-subtle p-md text-body-sm text-warning"
          />
        ) : payerMethod == null ? (
          <p className="rounded-lg bg-warning-subtle p-md text-body-sm text-warning">
            {course.college_name ?? 'This college'} has no setting for who pays yet. Open Partner Colleges, choose who
            pays for {course.college_name ?? 'this college'} (the college, the applicant, or both), then come back and
            accept.
          </p>
        ) : missingCommissionPercent ? (
          <p className="rounded-lg bg-warning-subtle p-md text-body-sm text-warning">
            Set {course.college_name ?? 'this college'}&rsquo;s commission % in Partner Colleges before accepting —
            the consultancy&rsquo;s share of the tuition needs to be agreed first.
          </p>
        ) : (
          <>
            <CommissionAmountFields
              value={amounts}
              onChange={(next) => {
                if (next.collegeAmount !== amounts.collegeAmount) setCollegeAmountTouched(true)
                setAmounts(next)
              }}
              needsCollege={needsCollege}
              needsStudent={needsStudent}
              courseFeeCurrency={courseFeeCurrency}
              collegeMessage={collegeMessage}
              studentMessage={studentMessage}
              collegeCurrencyNote="This course has no fee currency on record, so say which currency the college agreed to pay in."
              collegeNote={
                suggestion.data?.fee?.amount != null && suggestion.data.commission_percent != null ? (
                  <p className="col-span-3 -mt-xs text-caption text-text-secondary">
                    {suggestion.data.commission_percent}% of the{' '}
                    {formatMoney(suggestion.data.fee.currency, suggestion.data.fee.amount)} tuition — edit if the agreed
                    figure differs.
                  </p>
                ) : null
              }
              noIntakeNote={defaultMonth === ''}
            />
            <p className="text-caption text-text-secondary">
              Accepting is final for this case — one accepted college per student. A mistake can be undone with
              &ldquo;Undo acceptance&rdquo;, which records a reason in the audit log.
            </p>
          </>
        )}
      </form>
    </Modal>
  )
}
