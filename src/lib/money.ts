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
 * MONEY IS ALWAYS SHOWN WITH EXACTLY TWO DECIMALS, in every currency (owner's ruling
 * 2026-10-10): INR 1,240.00, JPY 1,500.00, KWD 1.25. The platform keeps every amount in hundredths
 * (`currency_exponent` is 2 for every currency), so no currency is shown with none or three.
 * Every place that writes an amount out goes through these functions rather than its own
 * `toLocaleString`, which shows "1,240" for a whole figure and up to three decimals for a long one.
 */
const TWO_DECIMALS = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const

/** The digits of an amount: grouped for the currency's locale (Indian for INR), always two decimals. */
export function formatMoneyDigits(amount: number, currency?: string | null): string {
  return amount.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', TWO_DECIMALS)
}

/**
 * Formats a currency amount with locale-aware digit grouping: Indian grouping (35,00,000) for
 * INR via `en-IN`, western grouping (3,500,000) for everything else via `en-US` — matching the
 * mobile app's money_format.dart so every console reads a figure identically. Renders as
 * `CURRENCY AMOUNT` (e.g. "INR 35,00,000"). Returns `—` when the amount is absent.
 */
export function formatMoney(currency: string | null | undefined, amount: number | null | undefined): string {
  if (amount == null) return '—'
  const formatted = formatMoneyDigits(amount, currency)
  return currency ? `${currency} ${formatted}` : formatted
}

/**
 * Digit-grouping only — no currency code prefixed. For "X / Y CURRENCY" ratio displays where the
 * currency is stated once, alongside the pair rather than repeated per figure.
 */
export function formatAmountOnly(currency: string | null | undefined, amount: number | null | undefined): string {
  if (amount == null) return '—'
  return formatMoneyDigits(amount, currency)
}

/**
 * A plain rupee figure as the finance and freelancer screens write it — "₹1,23,456", Indian
 * grouping, ₹ symbol (not {@link formatMoney}'s "INR" prefix). For the `*_inr` numbers those
 * screens hold, which are bare numbers rather than `{ amount, currency }`. A missing value reads
 * as ₹0; use {@link inrOrDash} where missing must read as "—" instead. Phase 5 cleanup (2026-09-24): these two
 * replace fourteen local copies — twelve of this one, two of the dash variant.
 */
export function inr(n: number | null | undefined): string {
  return rupeeSymbol(n ?? 0)
}

/** {@link inr}, but a missing value reads as "—" rather than ₹0. */
export function inrOrDash(n: number | null | undefined): string {
  return n == null ? '—' : rupeeSymbol(n)
}

/**
 * THE ONE PLACE A RUPEE FIGURE GETS ITS SYMBOL AND ITS SIGN. A negative reads "-₹500.00", never
 * "₹-500.00" (gate 12: a freelancer's `owed` can go negative — overpaid; Phase 8 T1-04: the minus
 * sign used to land after the symbol on a small negative balance). A figure that rounds to nothing
 * ("-0.004") reads "₹0.00" rather than "-₹0.00".
 */
export function rupeeSymbol(value: number): string {
  const digits = formatMoneyDigits(Math.abs(value), 'INR')
  return value < 0 && digits !== '0.00' ? `-₹${digits}` : `₹${digits}`
}

/**
 * An exchange rate as it is read on a screen: at most six decimals, no trailing zeros ("83.2",
 * "1.4", "0.012346"). The server stores a rate to many more places and a division can leave
 * eighteen digits ("1.4000000000000001"); nobody can read, check or quote that. Phase 8 T1-04:
 * every rate shown in the Finance boxes and notes goes through here.
 */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return rate.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6, useGrouping: false })
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

/**
 * The "≈" companion for an amount converted into the viewer's own currency (2026-09-10) — e.g.
 * "≈ THB 12,300". The SERVER converts (`approx` on money, `fee_display` on a course); this only
 * formats. Null when there is nothing to show, so callers render nothing rather than a fallback.
 */
export function formatApprox(approx: MoneyLike | null | undefined): string | null {
  if (!approx || approx.amount == null || !approx.currency) return null
  return `≈ ${formatMoney(approx.currency, approx.amount)}`
}

/** A course fee's "≈" — only when the server actually converted it into another currency. */
export function formatFeeApprox(
  feeDisplay: (MoneyLike & { approximate?: boolean | null }) | null | undefined,
): string | null {
  if (!feeDisplay?.approximate) return null
  return formatApprox(feeDisplay)
}
