import { formatMoneyAmount } from '@/lib/money'

type Money = Parameters<typeof formatMoneyAmount>[0]

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
