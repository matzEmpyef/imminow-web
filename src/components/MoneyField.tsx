import type { ComponentProps } from 'react'
import { TextField } from '@/components/TextField'
import { moneyDecimalsError } from '@/lib/moneyInput'

type MoneyFieldProps = Omit<ComponentProps<typeof TextField>, 'type' | 'step' | 'error'> & {
  /**
   * A sentence to show on the field that does not come from the decimals rule — the server's own
   * message for this field (`details.fields`), or the form's other rule. The decimals rule is
   * checked first: it describes what is typed now.
   */
  error?: string
  /** Defaults to 0.01 (the smallest amount); pass 0 where zero is allowed. */
  min?: number
}

/**
 * THE ONE MONEY INPUT (owner's ruling 2026-10-10: money has at most two decimal places, in every
 * currency). A number field that says "Amounts have at most two decimal places." under itself as
 * soon as a third decimal is typed. `12.340` is fine — a trailing zero is not a third decimal.
 * Forms still keep their own Save button off while {@link hasTooManyDecimals} is true for any
 * amount; the field only says why. Everything else is {@link TextField}.
 */
export function MoneyField({ error, min = 0.01, value, ...props }: MoneyFieldProps) {
  return <TextField {...props} type="number" min={min} step="0.01" value={value} error={moneyDecimalsError(value as string | number | undefined) ?? error} />
}
