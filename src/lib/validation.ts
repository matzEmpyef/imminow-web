const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Digits with optional leading +, allowing spaces/hyphens/parens as separators — 7 to 15 digits
// covers the full ITU E.164 range, generous enough for any real-world formatting.
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function isValidPhone(value: string): boolean {
  const digitCount = (value.match(/\d/g) ?? []).length
  return digitCount >= 7 && digitCount <= 15 && PHONE_RE.test(value.trim())
}

export const EMAIL_ERROR = 'Enter a valid email address.'
export const PHONE_ERROR = 'Enter a valid phone number.'

/**
 * The platform's age floor (server: `MIN_SIGNUP_AGE`, user 2026-09-05 — under-16s cannot sign
 * up). It lives here too since the assumptions audit (C9, approved 2026-09-19) made a date of
 * birth mandatory on Create Applicant: the server is still authoritative, this just lets the
 * console say the same thing before the round trip instead of echoing a 422 back.
 */
export const MIN_SIGNUP_AGE = 16
export const MINIMUM_AGE_ERROR = `Sentpo is for students aged ${MIN_SIGNUP_AGE} and over.`

/** Calendar-correct, not 365.25 days — a birthday is a date, not a duration. */
export function isAtLeastMinimumAge(dateOfBirth: string, minimumAge = MIN_SIGNUP_AGE): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth.trim())
  if (!parts) return false
  const [, year, month, day] = parts.map(Number)
  const now = new Date()
  let age = now.getFullYear() - year
  const hadBirthday = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day)
  if (!hadBirthday) age -= 1
  return age >= minimumAge
}
