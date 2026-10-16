import { MONEY_DECIMALS_ERROR, hasTooManyDecimals } from '@/lib/moneyInput'

/**
 * THE ONE SET OF FIELD RULES (Phase 9, owner's decision 154). Every form in the console asks this
 * file, so a name, an email, a phone number, an amount or a date means the same thing on every
 * screen and a refusal reads the same way: one plain sentence per kind of mistake.
 *
 * The shared inputs (`TextField`, `TextAreaField`, `MoneyField`) apply these by `kind`, so a form
 * names what the field IS and gets the limit, the counter and the sentence together. The server
 * holds the same limits and is still the authority: this only says it first, beside the field.
 *
 * Lengths are counted in characters (code points), never in UTF-16 units: a Hindi letter with its
 * vowel sign, or an emoji, counts the way a person counts it, not twice.
 */

// ---------------------------------------------------------------------------------------------
// Counting and cutting text
// ---------------------------------------------------------------------------------------------

/** How many characters (code points) the text has. An emoji is one, not two. */
export function charLength(text: string): number {
  // A string of N UTF-16 units has at most N code points, so short text needs no walk.
  if (text.length < 2) return text.length
  return Array.from(text).length
}

/** The text cut to at most `max` characters, never in the middle of a character. */
export function clipChars(text: string, max: number): string {
  if (text.length <= max) return text
  return Array.from(text).slice(0, max).join('')
}

// Intl.Segmenter splits text the way a reader sees it: a Devanagari letter with its vowel sign, a
// flag, a family emoji are each ONE unit. Missing only in very old engines; the code point is the
// fallback.
const graphemeSegmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

function graphemes(text: string): string[] {
  if (!graphemeSegmenter) return Array.from(text)
  return Array.from(graphemeSegmenter.segment(text), (part) => part.segment)
}

/**
 * The first character a reader sees in the text, upper-cased: the initial for an avatar. `charAt(0)`
 * would cut an emoji or a letter-with-vowel-sign in half and show a broken box.
 */
export function firstChar(text: string | null | undefined): string {
  const first = graphemes((text ?? '').trim())[0] ?? ''
  return first.toLocaleUpperCase()
}

/** The text cut to at most `max` visible characters with an ellipsis, never splitting one. */
export function clipGraphemes(text: string, max: number, ellipsis = '…'): string {
  const parts = graphemes(text)
  if (parts.length <= max) return text
  return parts.slice(0, max).join('').trimEnd() + ellipsis
}

/** Removes the characters no text field may carry (NUL and the other control codes, not line breaks or tabs). */
export function stripControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}

/** What is sent for a piece of text: control characters out, spaces at both ends trimmed. */
export function cleanText(text: string): string {
  return stripControlChars(text).trim()
}

// ---------------------------------------------------------------------------------------------
// Text kinds: names, titles, reasons, long text, chat
// ---------------------------------------------------------------------------------------------

export const NAME_MAX = 100
export const LABEL_MAX = 100
export const TITLE_MAX = 200
export const ADDRESS_LINE_MAX = 200
export const REASON_MIN = 3
export const REASON_MAX = 2000
export const ERASURE_REASON_MIN = 20
export const LONG_TEXT_MAX = 5000
export const CHAT_MAX = 4000
export const EMAIL_MAX = 254
export const SEARCH_MAX = 100
export const URL_MAX = 2048
export const PASSWORD_MAX = 256

/** Where a live counter appears: from this share of the limit upward. */
export const COUNTER_FROM = 0.9

export type TextKind =
  'name' | 'label' | 'title' | 'address' | 'reason' | 'erasureReason' | 'note' | 'longText' | 'chat'

interface TextRule {
  max: number
  /** Fewest characters once the text is trimmed. */
  min: number
  /** The field may be left empty; when it is not empty the limits above hold. */
  optional?: boolean
  /** What is said when a required field is left empty, when that differs from `sentence`. */
  empty?: string
  sentence: string
}

export const NAME_SENTENCE =
  'Use letters, spaces, hyphens, apostrophes and full stops only (no digits), up to 100 characters.'
export const SPACES_ONLY_SENTENCE = 'Enter some text, not only spaces.'

export const TEXT_RULES: Record<TextKind, TextRule> = {
  name: { max: NAME_MAX, min: 1, sentence: NAME_SENTENCE },
  label: { max: LABEL_MAX, min: 1, sentence: 'Use up to 100 characters.' },
  title: { max: TITLE_MAX, min: 1, sentence: 'Use up to 200 characters.' },
  address: { max: ADDRESS_LINE_MAX, min: 1, sentence: 'Use up to 200 characters.' },
  reason: { max: REASON_MAX, min: REASON_MIN, empty: 'Add a reason.', sentence: 'Enter 3 to 2000 characters.' },
  // A legal request must say what it is: the server refuses a shorter reason.
  erasureReason: {
    max: REASON_MAX,
    min: ERASURE_REASON_MIN,
    empty: 'Add a reason.',
    sentence: 'A legal request needs a reason of at least 20 characters.',
  },
  // A note nobody has to write: when there is one it is held to the same 3 to 2000 as a reason.
  note: { max: REASON_MAX, min: REASON_MIN, optional: true, sentence: 'Enter 3 to 2000 characters.' },
  longText: { max: LONG_TEXT_MAX, min: 0, optional: true, sentence: 'Use up to 5000 characters.' },
  chat: { max: CHAT_MAX, min: 1, sentence: 'A message can have up to 4000 characters.' },
}

/** The most characters a kind of text may have. */
export function textLimit(kind: TextKind): number {
  return TEXT_RULES[kind].max
}

// Letters of any script and the marks that belong to them (vowel signs, viramas), the zero-width
// joiners Indian scripts use inside a letter group, then space, hyphen, apostrophe, full stop.
// Digits and every other symbol are left out.
const NAME_RE = /^(?:[\p{L}\p{M}]|\u200c|\u200d)(?:[\p{L}\p{M} .'’-]|\u200c|\u200d)*$/u

/** True when the text, as a person's name, has only the characters a name may have. */
export function isNameText(text: string): boolean {
  return NAME_RE.test(text)
}

/** A person's name as it is sent: control characters out, outer spaces trimmed, inner runs of spaces made one. */
export function cleanName(text: string): string {
  return cleanText(text).replace(/\s+/g, ' ')
}

/**
 * The sentence for text that does not fit its kind, else undefined. Strict: an empty value is
 * wrong when the kind needs at least one character (`min`), so a form shows the result only when
 * it should (after a first try, or once something is typed) — pass `optional` for a field that may
 * be left empty. Whitespace-only text is refused with its own sentence.
 */
export function checkText(kind: TextKind, value: string, options: { optional?: boolean } = {}): string | undefined {
  const rule = TEXT_RULES[kind]
  const trimmed = kind === 'name' ? cleanName(value) : cleanText(value)
  if (trimmed === '') {
    if (value !== '') return SPACES_ONLY_SENTENCE
    return options.optional || rule.optional ? undefined : (rule.empty ?? rule.sentence)
  }
  const length = charLength(trimmed)
  if (length > rule.max || length < rule.min) return rule.sentence
  if (kind === 'name' && !isNameText(trimmed)) return NAME_SENTENCE
  return undefined
}

/** Whether `checkText` finds nothing wrong. */
export function isTextOk(kind: TextKind, value: string, options: { optional?: boolean } = {}): boolean {
  return checkText(kind, value, options) === undefined
}

// ---------------------------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/

export const EMAIL_ERROR = 'Enter a valid email address.'

/** An email as it is sent: trimmed and lower-cased. */
export function normaliseEmail(value: string): string {
  return cleanText(value).toLowerCase()
}

export function isValidEmail(value: string): boolean {
  const email = normaliseEmail(value)
  return charLength(email) <= EMAIL_MAX && EMAIL_RE.test(email)
}

/** The sentence for an email that is not one, else undefined. Empty is not an error here. */
export function emailError(value: string): string | undefined {
  return value.trim() !== '' && !isValidEmail(value) ? EMAIL_ERROR : undefined
}

// ---------------------------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------------------------

/**
 * The one sentence for a phone number that is not one. The server says exactly this on every
 * screen where staff enter a phone, so the forms use it as their help text and as their message.
 */
export const STAFF_PHONE_SENTENCE = 'Enter the phone number with the country code, for example +919876543210.'
export const PHONE_ERROR = STAFF_PHONE_SENTENCE
/** An Indian (+91) number is ten digits and starts with 6, 7, 8 or 9. */
export const INDIA_PHONE_SENTENCE = 'An Indian (+91) number has 10 digits and starts with 6, 7, 8 or 9.'

const INDIA_MOBILE_RE = /^[6-9]\d{9}$/

/**
 * Reads a typed phone number the way the server does.
 *
 * - With a country code (`+` or `00` first): 8 to 15 digits in all; a +91 number is exactly ten
 *   digits starting 6 to 9.
 * - Without: a local number, read in the country the caller passes as `region` (its dial code, for
 *   example `'91'`; the consultancy's own country for its staff). With no region a bare number
 *   cannot be read, and the sentence asks for the country code. `LOCAL_PHONE_REGION` stands for a
 *   consultancy whose country this console has no calling code for: a local number of 6 to 15 digits
 *   is let through as typed, for the server to read in that country.
 *
 * Spaces, hyphens, dots and brackets are formatting and ignored. Returns the number as it is
 * sent (`+` and digits only), or the sentence for what is wrong.
 */
/** The "region" of a consultancy in a country this console has no calling code for (see `readPhone`). */
export const LOCAL_PHONE_REGION = 'local'

export function readPhone(value: string, region?: string): { ok: true; e164: string } | { ok: false; message: string } {
  const text = cleanText(value)
  if (!text) return { ok: false, message: STAFF_PHONE_SENTENCE }
  if (!/^\+?[\d\s().-]+$/.test(text) || text.indexOf('+') > 0) return { ok: false, message: STAFF_PHONE_SENTENCE }
  const digits = text.replace(/\D/g, '')
  let international: string
  if (text.startsWith('+')) {
    international = digits
  } else if (digits.startsWith('00')) {
    international = digits.slice(2)
  } else if (region === LOCAL_PHONE_REGION) {
    return digits.length >= 6 && digits.length <= 15
      ? { ok: true, e164: digits }
      : { ok: false, message: STAFF_PHONE_SENTENCE }
  } else if (region) {
    international = region + digits.replace(/^0+/, '')
  } else {
    return { ok: false, message: STAFF_PHONE_SENTENCE }
  }
  if (international.startsWith('91') && !INDIA_MOBILE_RE.test(international.slice(2))) {
    return { ok: false, message: INDIA_PHONE_SENTENCE }
  }
  if (!/^[1-9]\d{7,14}$/.test(international)) return { ok: false, message: STAFF_PHONE_SENTENCE }
  return { ok: true, e164: `+${international}` }
}

export function isValidPhone(value: string, region?: string): boolean {
  return readPhone(value, region).ok
}

/** The sentence for a phone number that is not one, else undefined. Empty is not an error here. */
export function phoneError(value: string, region?: string): string | undefined {
  if (value.trim() === '') return undefined
  const result = readPhone(value, region)
  return result.ok ? undefined : result.message
}

/** The phone as it is sent (`+` and digits), or the trimmed text when it cannot be read. */
export function phoneToSend(value: string, region?: string): string {
  const result = readPhone(value, region)
  return result.ok ? result.e164 : cleanText(value)
}

// ---------------------------------------------------------------------------------------------
// Money, percentages, counts
// ---------------------------------------------------------------------------------------------

/** The most one entry may hold: 99,99,99,999.99. */
export const MONEY_MAX = 9_999_999_999.99
export const MONEY_SENTENCE = 'Enter an amount from 0.01 to 99,99,99,999.99, with at most two decimal places.'
export const MONEY_OR_ZERO_SENTENCE = 'Enter an amount from 0 to 99,99,99,999.99, with at most two decimal places.'
export { MONEY_DECIMALS_ERROR }

/**
 * The sentence for an amount that does not fit, else undefined. Empty is not an error here (the
 * form asks for it). Zero is allowed only where the form has a "no charge" choice: pass
 * `allowZero` there.
 */
export function moneyError(
  value: string | number | null | undefined,
  options: { allowZero?: boolean } = {},
): string | undefined {
  if (value == null || String(value).trim() === '') return undefined
  const text = String(value).trim()
  const sentence = options.allowZero ? MONEY_OR_ZERO_SENTENCE : MONEY_SENTENCE
  if (hasTooManyDecimals(text)) return MONEY_DECIMALS_ERROR
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount < 0) return sentence
  if (amount === 0) return options.allowZero ? undefined : sentence
  return amount <= MONEY_MAX ? undefined : sentence
}

export const PERCENT_SENTENCE = 'Enter a percentage from 0 to 100, with at most two decimal places.'

/** The sentence for a percentage outside 0 to 100 or with more than two decimals, else undefined. */
export function percentError(value: string | number | null | undefined): string | undefined {
  if (value == null || String(value).trim() === '') return undefined
  const text = String(value).trim()
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount < 0 || amount > 100 || hasTooManyDecimals(text)) return PERCENT_SENTENCE
  return undefined
}

/** Stock, capacity and a point cost go up to 10,00,000; an event's points to 1,00,000. */
export const COUNT_MAX = 1_000_000
export const EVENT_POINTS_MAX = 100_000
export const BACKLOGS_MAX = 99

function grouped(n: number): string {
  return n.toLocaleString('en-IN')
}

export function countSentence(min: number, max: number): string {
  return `Enter a whole number from ${grouped(min)} to ${grouped(max)}.`
}

/** The sentence for a count that is not a whole number within `min` to `max`, else undefined. */
export function countError(
  value: string | number | null | undefined,
  options: { min?: number; max?: number } = {},
): string | undefined {
  if (value == null || String(value).trim() === '') return undefined
  const { min = 0, max = COUNT_MAX } = options
  const text = String(value).trim()
  const n = Number(text)
  if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(n) || n < min || n > max) return countSentence(min, max)
  return undefined
}

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

export const DATE_MIN = '1900-01-01'
export const DATE_MAX = '2100-12-31'
export const DATETIME_MIN = '1900-01-01T00:00'
export const DATETIME_MAX = '2100-12-31T23:59'
export const DATE_SENTENCE = 'Enter a date between 1900 and 2100.'
export const DATE_RANGE_SENTENCE = 'The end date must be on or after the start date.'
export const DATE_OF_BIRTH_SENTENCE = 'Enter a date of birth from 1900 up to today.'

/** The calendar date and time a typed value stands for, or null when it is not a real one. */
function parseDateValue(value: string): { year: number; stamp: number } | null {
  const match = /^(\d{4,6})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value.trim())
  if (!match) return null
  const [, y, m, d, hh = '0', mm = '0'] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  const probe = new Date(Date.UTC(2000, month - 1, day))
  probe.setUTCFullYear(year)
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  if (Number(hh) > 23 || Number(mm) > 59) return null
  return { year, stamp: probe.getTime() + Number(hh) * 3_600_000 + Number(mm) * 60_000 }
}

/** The sentence for a date or date-and-time outside 1900 to 2100, else undefined. Empty is fine. */
export function dateError(value: string | null | undefined): string | undefined {
  if (!value || value.trim() === '') return undefined
  const parsed = parseDateValue(value)
  return parsed && parsed.year >= 1900 && parsed.year <= 2100 ? undefined : DATE_SENTENCE
}

/** The sentence when the end is before the start. Nothing is said while either is empty or unreadable. */
export function dateRangeError(start: string | null | undefined, end: string | null | undefined): string | undefined {
  if (!start || !end) return undefined
  const a = parseDateValue(start)
  const b = parseDateValue(end)
  if (!a || !b) return undefined
  return b.stamp < a.stamp ? DATE_RANGE_SENTENCE : undefined
}

/** A date of birth: 1900 up to today (today is the person's own). Empty is fine. */
export function dateOfBirthError(value: string | null | undefined): string | undefined {
  if (!value || value.trim() === '') return undefined
  const parsed = parseDateValue(value)
  if (!parsed || parsed.year < 1900) return DATE_OF_BIRTH_SENTENCE
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return parsed.stamp > today ? DATE_OF_BIRTH_SENTENCE : undefined
}

// ---------------------------------------------------------------------------------------------
// Codes and web links
// ---------------------------------------------------------------------------------------------

export const REFERRAL_CODE_LENGTH = { min: 4, max: 20 } as const
export const VENUE_CODE_LENGTH = { min: 6, max: 20 } as const

const CODE_RE = /^[A-Z0-9-]+$/

export function codeSentence(range: { min: number; max: number }): string {
  return `Use ${range.min} to ${range.max} letters, digits or dashes.`
}

/** A code as it is typed and sent: trimmed, in capitals. */
export function normaliseCode(value: string): string {
  return cleanText(value).toUpperCase()
}

/** The sentence for a code outside its length or character set, else undefined. Empty is fine. */
export function codeError(value: string, range: { min: number; max: number }): string | undefined {
  const code = normaliseCode(value)
  if (code === '') return undefined
  const length = charLength(code)
  return length < range.min || length > range.max || !CODE_RE.test(code) ? codeSentence(range) : undefined
}

export const URL_SENTENCE = 'Enter a web address that starts with https:// (up to 2048 characters).'

export function isValidHttpsUrl(value: string): boolean {
  const text = value.trim()
  if (text === '' || charLength(text) > URL_MAX || /\s/.test(text)) return false
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && url.hostname.includes('.')
  } catch {
    return false
  }
}

/** The sentence for a web address that is not an https one, else undefined. Empty is fine. */
export function urlError(value: string): string | undefined {
  return value.trim() === '' || isValidHttpsUrl(value) ? undefined : URL_SENTENCE
}

// ---------------------------------------------------------------------------------------------
// Age and payment references (older rules, kept)
// ---------------------------------------------------------------------------------------------

export const E164_PHONE_ERROR = STAFF_PHONE_SENTENCE

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

/**
 * The longest a payment's transaction id / reference may be (review I-026; the contract's
 * `maxLength` on a declared payment's `transaction_id` and a received payment's `reference`). The
 * inputs stop at it, so nobody types a reference the server would refuse.
 */
export const PAYMENT_REFERENCE_MAX = 200

// ---------------------------------------------------------------------------------------------
// Field kinds: what the shared inputs ask
// ---------------------------------------------------------------------------------------------

/** What a one-line field holds. A form names the kind; the input gets the limit, counter and sentence. */
export type FieldKind =
  | 'name'
  | 'label'
  | 'title'
  | 'address'
  | 'reason'
  | 'erasureReason'
  | 'note'
  | 'email'
  | 'phone'
  | 'url'
  | 'search'
  | 'code'
  | 'percent'
  | 'count'

export interface FieldKindOptions {
  /** Phone: the dial code of the country a local number is read in (see `readPhone`). */
  phoneRegion?: string
  /** Code: its length range. */
  codeRange?: { min: number; max: number }
  /** Count: its ceiling and floor. */
  countMin?: number
  countMax?: number
}

/** No field is left without a ceiling: a one-line field with no rule of its own stops here. */
export const DEFAULT_LINE_MAX = TITLE_MAX
/** The ceiling of a whole number the server stores (2,147,483,647). */
export const INTEGER_MAX = 2_147_483_647

/** The most characters a kind of one-line field takes, or undefined when its own rule bounds it. */
export function fieldKindLimit(kind: FieldKind, options: FieldKindOptions = {}): number | undefined {
  switch (kind) {
    case 'name':
      return NAME_MAX
    case 'label':
      return LABEL_MAX
    case 'title':
    case 'address':
      return TITLE_MAX
    case 'reason':
    case 'erasureReason':
    case 'note':
      return REASON_MAX
    case 'email':
      return EMAIL_MAX
    case 'url':
      return URL_MAX
    case 'search':
      return SEARCH_MAX
    case 'phone':
      return 25
    case 'code':
      return (options.codeRange ?? REFERRAL_CODE_LENGTH).max
    default:
      return undefined
  }
}

/** The sentence a one-line field of this kind shows for what is typed, else undefined. Empty is never an error here. */
export function fieldKindError(kind: FieldKind, value: string, options: FieldKindOptions = {}): string | undefined {
  if (value === '') return undefined
  switch (kind) {
    case 'name':
    case 'label':
    case 'title':
    case 'address':
    case 'reason':
    case 'erasureReason':
    case 'note':
      return checkText(kind, value, { optional: true })
    case 'email':
      return emailError(value)
    case 'phone':
      return phoneError(value, options.phoneRegion)
    case 'url':
      return urlError(value)
    case 'search':
      return charLength(value) > SEARCH_MAX ? `Search for up to ${SEARCH_MAX} characters.` : undefined
    case 'code':
      return codeError(value, options.codeRange ?? REFERRAL_CODE_LENGTH)
    case 'percent':
      return percentError(value)
    case 'count':
      return countError(value, { min: options.countMin, max: options.countMax })
  }
}

/** Whether the text of a reason/note field is long enough and not too long once trimmed. */
export function reasonOk(value: string, kind: 'reason' | 'erasureReason' = 'reason'): boolean {
  return checkText(kind, value) === undefined
}

/**
 * The sentence for a typed number outside the range its field allows, else undefined. A field with
 * no range of its own is held to the server's whole-number ceiling (2,147,483,647). Used by the
 * shared `TextField` for every number input that names no kind.
 */
export function numberRangeError(value: string, min?: number | string, max?: number | string): string | undefined {
  if (value.trim() === '') return undefined
  const lo = min === undefined || min === '' ? undefined : Number(min)
  const hi = max === undefined || max === '' ? INTEGER_MAX : Number(max)
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Enter a number.'
  if ((lo !== undefined && n < lo) || n > hi) {
    return lo === undefined
      ? `Enter a number up to ${hi.toLocaleString('en-IN')}.`
      : `Enter a number from ${lo.toLocaleString('en-IN')} to ${hi.toLocaleString('en-IN')}.`
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------
// What is sent: never untrimmed text
// ---------------------------------------------------------------------------------------------

// A password may begin or end with a space on purpose, and a one-time code or token is exactly what
// the person was given: those are sent as they are.
const KEEP_AS_TYPED = /password|passcode|secret|token|passphrase/i

/**
 * Every piece of text in a request body, trimmed and free of control characters (a NUL cannot be
 * saved), except the secrets named above. The console's one request client runs this on every JSON
 * body, so a form that forgot to trim still never sends a name or a note with spaces around it.
 */
export function cleanPayload<T>(value: T, key = ''): T {
  if (typeof value === 'string') {
    return (KEEP_AS_TYPED.test(key) ? value : cleanText(value)) as T
  }
  if (Array.isArray(value)) return value.map((item) => cleanPayload(item, key)) as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = cleanPayload(v, k)
    return out as T
  }
  return value
}
