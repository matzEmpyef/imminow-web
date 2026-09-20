import { formatMoneyAmount } from '@/lib/money'

type Money = Parameters<typeof formatMoneyAmount>[0]

/**
 * What a payment row carries about its own money (assumptions audit M15, product owner
 * 2026-09-19). Structural rather than the full `CommissionPayment`, so a due, a correction row
 * or a bulk-confirm draft can be passed in unchanged.
 */
export interface PaymentMoney {
  amount: { amount?: number | null; currency?: string | null }
  /** The stored fact, in minor units. */
  amount_minor?: number
  /** ISO 4217 minor-unit exponent for `currency`: 2 for most, 0 for JPY/KRW/VND, 3 for the Gulf dinars. */
  currency_exponent?: number
  amount_inr?: number | null
  /** The INR-per-unit rate FROZEN onto the row when the payment was declared. */
  rate_used?: number | null
  /** When that rate was set. */
  rate_as_of?: string | null
}

/**
 * THE AMOUNT, FROM MINOR UNITS WHERE THE RESPONSE HAS THEM (assumptions audit M15).
 *
 * A received amount used to be rounded to whole units server-side, so CAD 1,240.60 was recorded
 * as 1,241 and CAD 1,240.40 as 1,240 — real money over a year of settlements, invisible because
 * the number looked exact. `amount_minor` is the stored fact now; `amount` is derived from it,
 * and a row written before the change carries only `amount`.
 */
export function paymentAmount(p: PaymentMoney | null | undefined): number | undefined {
  if (!p) return undefined
  if (p.amount_minor != null) return p.amount_minor / 10 ** (p.currency_exponent ?? 2)
  return p.amount?.amount ?? undefined
}

/** The payment's own amount, formatted — minor units where they exist (M15). */
export function paymentMoney(p: PaymentMoney | null | undefined): string {
  const amount = paymentAmount(p)
  if (amount == null) return '—'
  return money({ amount, currency: p?.amount?.currency })
}

/** "12 Sep" — short enough to sit inside a rate note without crowding the amount beside it. */
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

/**
 * THE STORED RATE, NOT A LIVE ONE (assumptions audit M15, product owner 2026-09-19).
 *
 * A cross-currency settlement used to be converted at today's rate on every read, so which part
 * of a due a payment settled changed retroactively whenever an admin edited the rate table. The
 * rate is frozen onto the row when the payment is declared, and shown — "≈ ₹1,03,168 at 83.20,
 * rate of 12 Sep" — so a disputed ₹ figure can be explained rather than argued about.
 *
 * Null for an INR payment (there is nothing to convert) and for a row written before the rate
 * was stored, where the ≈ figure stands alone rather than claiming a rate nobody recorded.
 */
export function paymentInrNote(p: PaymentMoney | null | undefined): string | null {
  const currency = p?.amount?.currency
  if (!p || !currency || currency === 'INR' || p.amount_inr == null) return null
  const approx = `≈ ₹${p.amount_inr.toLocaleString('en-IN')}`
  if (p.rate_used == null) return approx
  const asOf = p.rate_as_of ? shortDate(p.rate_as_of) : ''
  return `${approx} at ${p.rate_used}${asOf ? `, rate of ${asOf}` : ''}`
}

/**
 * Money on the Finance Dashboard. immiNow's cut is held in rupees and every other figure on these
 * pages reads "₹1,23,456", so INR amounts use the symbol here rather than the platform-wide
 * "INR 1,23,456"; anything in another currency keeps the shared formatting.
 */
export function money(m: Money): string {
  if (!m || m.amount == null) return '—'
  return m.currency === 'INR' ? `₹${m.amount.toLocaleString('en-IN')}` : formatMoneyAmount(m)
}

/**
 * Currency codes offered on the finance dashboard's currency pickers (add-due, override-share) —
 * every part is owed in the currency it arrives in (2026-09-11), so these forms need a currency
 * choice rather than assuming INR. Not exhaustive — a case's own currencies (from `by_currency`)
 * always come first via {@link currencyOptions}; this is just the common fallback list beneath them.
 */
export const COMMON_CURRENCIES = ['INR', 'USD', 'CAD', 'GBP', 'AUD', 'EUR', 'NZD', 'SGD', 'AED', 'THB']

/**
 * The case's own currencies first (so the common case needs no scrolling), then any common code
 * not already listed.
 *
 * `include` carries whatever the FORM is currently holding — the currency of the due being
 * received, say (assumptions audit M34, product owner 2026-09-19). Without it a due already
 * recorded in a currency outside this ten-code list selected nothing at all: the picker read
 * blank over a real, saved currency, and the first touch of the select rewrote it.
 */
export function currencyOptions(caseCurrencies: (string | undefined)[], ...include: (string | null | undefined)[]): string[] {
  const own = [...new Set([...caseCurrencies, ...include].filter((c): c is string => Boolean(c)))]
  const seen = new Set(own)
  return [...own, ...COMMON_CURRENCIES.filter((c) => !seen.has(c))]
}
