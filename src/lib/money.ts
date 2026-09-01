// Shared money-formatting primitive (audit finding, 2026-09-01): CollegeDetailPage's course fee
// rendered western digit grouping (₹3,500,000) while Course Finder rendered Indian grouping
// (₹35,00,000) for the very same INR amount — a live cross-page inconsistency. Course Finder's
// `formatFee` (CourseFinderColumns.tsx) was the richest existing variant — it already carried the
// INR-vs-western locale rule matching the mobile app's money_format.dart — so it's the reference
// behavior here; every other hand-rolled `toLocaleString` variant across the app is replaced by
// this file's functions instead of carrying its own copy.

interface MoneyLike {
  amount?: number | null
  currency?: string | null
}

/**
 * Formats a currency amount with locale-aware digit grouping: Indian grouping (35,00,000) for
 * INR via `en-IN`, western grouping (3,500,000) for everything else via `en-US` — matching the
 * mobile app's money_format.dart so every console reads a figure identically. Renders as
 * `CURRENCY AMOUNT` (e.g. "INR 35,00,000"). Returns `—` when the amount is absent.
 */
export function formatMoney(currency: string | null | undefined, amount: number | null | undefined): string {
  if (amount == null) return '—'
  const locale = currency === 'INR' ? 'en-IN' : 'en-US'
  const formatted = amount.toLocaleString(locale)
  return currency ? `${currency} ${formatted}` : formatted
}

/**
 * Digit-grouping only — no currency code prefixed. For "X / Y CURRENCY" ratio displays where the
 * currency is stated once, alongside the pair rather than repeated per figure.
 */
export function formatAmountOnly(currency: string | null | undefined, amount: number | null | undefined): string {
  if (amount == null) return '—'
  const locale = currency === 'INR' ? 'en-IN' : 'en-US'
  return amount.toLocaleString(locale)
}

/** Same as {@link formatMoney}, taking the `{ amount, currency }` shape the API returns directly. */
export function formatMoneyAmount(money: MoneyLike | null | undefined): string {
  if (!money) return '—'
  return formatMoney(money.currency, money.amount)
}

/**
 * Formats a course/plan fee, appending a `/yr` suffix when `feePeriod` is `'per_year'`. Returns
 * `—` when the fee has no amount.
 */
export function formatCourseFee(fee: MoneyLike | null | undefined, feePeriod?: string | null): string {
  if (!fee || fee.amount == null) return '—'
  const period = feePeriod === 'per_year' ? '/yr' : ''
  return `${formatMoney(fee.currency, fee.amount)}${period}`
}
