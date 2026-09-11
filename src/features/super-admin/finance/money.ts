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
