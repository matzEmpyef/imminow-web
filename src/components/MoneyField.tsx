import type { ComponentProps } from 'react'
import { TextField } from '@/components/TextField'
import { MONEY_MAX, moneyError } from '@/lib/validation'

type MoneyFieldProps = Omit<ComponentProps<typeof TextField>, 'type' | 'step' | 'error' | 'min' | 'kind'> & {
  /**
   * A sentence to show on the field that does not come from the amount rule — the server's own
   * message for this field (`details.fields`), or the form's other rule. The amount rule is
   * checked first: it describes what is typed now.
   */
  error?: string
  /**
   * Zero is accepted only where the form has a "no charge" choice and it is chosen (decision 154);
   * everywhere else the least is 0.01.
   */
  allowZero?: boolean
}

/**
 * THE ONE MONEY INPUT (owner's rulings 2026-10-10 and decision 154): an amount is from 0.01 up to
 * 99,99,99,999.99 with at most two decimal places, in every currency. A number field that says so
 * under itself as soon as what is typed does not fit; `12.340` is fine — a trailing zero is not a
 * third decimal. Forms still keep their own Save button off while {@link moneyError} finds
 * something wrong for any amount; the field only says why. Everything else is {@link TextField}.
 */
export function MoneyField({ error, allowZero = false, value, ...props }: MoneyFieldProps) {
  return (
    <TextField
      {...props}
      type="number"
      min={allowZero ? 0 : 0.01}
      max={props.max ?? MONEY_MAX}
      step="0.01"
      value={value}
      error={moneyError(value as string | number | undefined, { allowZero }) ?? error}
    />
  )
}
