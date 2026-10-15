import { fieldMessages } from '@/api/errors'
import type { components } from '@/api/schema'
import { MONTHS } from '@/features/super-admin/courseFormShared'
import { hasTooManyDecimals, serverMoneyMessage } from '@/lib/moneyInput'

type Course = components['schemas']['Course']
export type AdmissionCommission = components['schemas']['AdmissionCommission']

/**
 * What is typed into the Accept popup's money fields. Shared by the Accept popup and by the
 * consultancy moves that take the admission along (Support's switch, Applicant Allocation), so the
 * two ask for the same amounts in the same way. Amounts are kept as typed text.
 */
export interface CommissionAmounts {
  collegeAmount: string
  /** Used only when the course has no fee currency of its own to lock the college side to. */
  collegeCurrency: string
  studentAmount: string
  /** No default at all: what the student agreed to pay in is a fact about this agreement. */
  studentCurrency: string
  startMonth: string
  startYear: number
}

/**
 * The course start the Accept popup offers: the course's nearest intake month, in the year its
 * own application deadline implies (the intake is the deadline's year, one later when the intake
 * month falls before the deadline's month). With no deadline it is the next time that month comes
 * round. With no intake at all the month is empty and must be chosen (assumptions audit H18).
 */
export function defaultCourseStart(course: Pick<Course, 'next_intake' | 'intakes'> | null | undefined): {
  month: string
  year: number
} {
  const month = course?.next_intake?.month ?? course?.intakes?.[0] ?? ''
  const now = new Date()
  const deadline = course?.next_intake?.application_deadline
  if (deadline) {
    // UTC getters: "YYYY-MM-DD" parses as UTC midnight, and reading it back with local getters
    // can roll it back a calendar day (and occasionally a month/year) west of UTC.
    const deadlineDate = new Date(deadline)
    return {
      month,
      year: deadlineDate.getUTCFullYear() + (MONTHS.indexOf(month) < deadlineDate.getUTCMonth() ? 1 : 0),
    }
  }
  if (month === '') return { month, year: now.getFullYear() }
  return { month, year: MONTHS.indexOf(month) < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear() }
}

/** Empty money fields with the course start the course offers (none when no course is known). */
export function emptyAmounts(course?: Pick<Course, 'next_intake' | 'intakes' | 'fee'> | null): CommissionAmounts {
  const start = defaultCourseStart(course)
  return {
    collegeAmount: '',
    collegeCurrency: course?.fee?.currency ?? '',
    studentAmount: '',
    studentCurrency: '',
    startMonth: start.month,
    startYear: start.year,
  }
}

function amountOk(amount: string, currency: string): boolean {
  return Number(amount) > 0 && !hasTooManyDecimals(amount) && currency !== ''
}

/**
 * The body of `commission` / `admission_commission`: only the sides that apply, each with its
 * currency. `courseFeeCurrency` is the course's own fee currency when it has one (the college side
 * is locked to it), else the currency picked for the college side.
 */
export function commissionBody(
  amounts: CommissionAmounts,
  sides: { college: boolean; student: boolean },
  courseFeeCurrency: string,
): AdmissionCommission {
  const body: AdmissionCommission = { course_start: { month: amounts.startMonth, year: amounts.startYear } }
  if (sides.college) {
    body.expected_from_college = { amount: Number(amounts.collegeAmount), currency: courseFeeCurrency || amounts.collegeCurrency }
  }
  if (sides.student) {
    body.expected_from_student = { amount: Number(amounts.studentAmount), currency: amounts.studentCurrency }
  }
  return body
}

/**
 * The amounts for a moved admission. Console does not know which side applies to the new
 * consultancy (the server decides from the new case's payer method or the new consultancy's
 * Partner College), so a side is sent when it has been filled in; the server says if it needs the
 * other too.
 */
export function admissionCommissionBody(amounts: CommissionAmounts): AdmissionCommission {
  const hasCollege = amountOk(amounts.collegeAmount, amounts.collegeCurrency)
  const hasStudent = amountOk(amounts.studentAmount, amounts.studentCurrency)
  return commissionBody(amounts, { college: hasCollege, student: hasStudent }, '')
}

/**
 * What still has to be filled in before a moved admission can be sent, in plain words — the
 * "Still needed" line, and the reason the Move button stays off. Empty when the form is complete.
 * At least one amount is always needed; whether the other is too is the server's answer.
 */
export function stillNeeded(amounts: CommissionAmounts): string[] {
  const out: string[] = []
  const college = amounts.collegeAmount.trim() !== ''
  const student = amounts.studentAmount.trim() !== ''
  if (!college && !student) out.push('an amount from the college or the student')
  if (college) {
    if (!(Number(amounts.collegeAmount) > 0) || hasTooManyDecimals(amounts.collegeAmount)) out.push('a valid amount from the college')
    else if (amounts.collegeCurrency === '') out.push('the currency of the college amount')
  }
  if (student) {
    if (!(Number(amounts.studentAmount) > 0) || hasTooManyDecimals(amounts.studentAmount)) out.push('a valid amount from the student')
    else if (amounts.studentCurrency === '') out.push('the currency of the student amount')
  }
  if (amounts.startMonth === '') out.push('the month the course starts')
  return out
}

/** The "Still needed: …" sentence, or null when nothing is missing. */
export function stillNeededLine(amounts: CommissionAmounts): string | null {
  const missing = stillNeeded(amounts)
  return missing.length ? `Still needed: ${missing.join(', ')}.` : null
}

/** The sentence the server gave about the admission's amounts, as served (`admission_commission`). */
const ADMISSION_FIELD = 'admission_commission'
const ADMISSION_CODES = ['not_a_partner_college', 'admission_cannot_move']

/**
 * The server's refusal about the admission, exactly as served: a sentence against
 * `admission_commission` (missing or invalid amounts, a college that is not the new consultancy's
 * Partner College, an admission that cannot move). Undefined for any other failure, which the
 * form shows in its footer as before.
 */
export function admissionRefusal(error: unknown): string | undefined {
  const message = fieldMessages(error)[ADMISSION_FIELD]
  if (message) return message
  const code = (error as { code?: string } | null | undefined)?.code
  if (code && ADMISSION_CODES.includes(code) && error instanceof Error) return error.message
  return undefined
}

/** The server's sentence for one of the amounts, when it named that amount's field. */
export function admissionAmountMessage(error: unknown, side: 'college' | 'student'): string | undefined {
  return serverMoneyMessage(
    error,
    `${ADMISSION_FIELD}.expected_from_${side}.amount`,
    `${ADMISSION_FIELD}.expected_from_${side}`,
  )
}
