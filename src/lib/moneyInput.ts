import { fieldMessages } from '@/api/errors'

/**
 * Money is typed with at most two decimal places, in every currency (owner's ruling 2026-10-10).
 * The server refuses a third decimal with this very sentence, against the field in
 * `details.fields`, and never rounds it — so the console says it first, beside the field, and
 * never sends it.
 */
export const MONEY_DECIMALS_ERROR = 'Amounts have at most two decimal places.'

/**
 * True when a typed amount has a third (or later) decimal place that is not a zero. `12.340` is
 * fine — a trailing zero is not a third decimal — `12.341` is not. Empty or unreadable text is not
 * "too many decimals" (it is some other kind of invalid, which the form already handles).
 */
export function hasTooManyDecimals(value: string | number | null | undefined): boolean {
  if (value == null) return false
  let text = String(value).trim()
  if (text === '') return false
  // A number field can hold "1e-3"; write it out in full before counting decimals.
  if (/e/i.test(text)) {
    const n = Number(text)
    if (!Number.isFinite(n)) return false
    text = n.toFixed(12)
  }
  const dot = text.indexOf('.')
  if (dot === -1) return false
  return /[1-9]/.test(text.slice(dot + 1 + 2))
}

/** The inline sentence for an amount typed with too many decimals, else undefined. */
export function moneyDecimalsError(value: string | number | null | undefined): string | undefined {
  return hasTooManyDecimals(value) ? MONEY_DECIMALS_ERROR : undefined
}

/**
 * The server's own sentence for an amount it refused, from `details.fields` of the failed save
 * (400/422 `validation_failed`), so the form shows it on the field it is about. Fields are named
 * as the server names them for that request — `amount`, `amount.amount`, `line_items[0].amount`,
 * `subscription_amount` — so the caller says which to look for; the first one present wins.
 */
export function serverMoneyMessage(error: unknown, ...fields: string[]): string | undefined {
  const messages = fieldMessages(error)
  for (const field of fields) if (messages[field]) return messages[field]
  return undefined
}
