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
