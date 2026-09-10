// Currency pickers read the platform's exchange-rate table (2026-09-10) — was a fixed list of six
// codes, so a currency an admin added on Settings → Exchange Rates (THB, say) could not be picked
// as a course's fee currency, an agreed commission, or a payment. A currency with no rate is
// deliberately not offered: every "≈" conversion needs one.
import { useExchangeRates } from '@/queries/catalogSettings'

/**
 * Every currency the rate table holds, sorted, plus any `include` values not already in it — so a
 * record's existing currency, or a sensible default, is always selectable even while the rates are
 * loading or if its rate was later removed.
 */
export function useCurrencyCodes(...include: (string | null | undefined)[]): string[] {
  const rates = useExchangeRates()
  const codes = new Set((rates.data ?? []).map((r) => r.currency))
  for (const code of include) if (code) codes.add(code)
  if (codes.size === 0) codes.add('INR')
  return [...codes].sort()
}
