import { COUNTER_FROM } from '@/lib/validation'

/**
 * The live "92 / 100" under a text field that is close to its limit (Phase 9, decision 154). It
 * appears from 90% of the limit and not before, so a short field stays clean; it turns red at the
 * limit. Counted in characters, the same way the field stops typing.
 */
export function CharCounter({ count, limit, id }: { count: number; limit: number; id?: string }) {
  if (count < limit * COUNTER_FROM) return null
  return (
    <span
      id={id}
      aria-live="polite"
      className={`ml-auto shrink-0 pr-lg text-caption ${count >= limit ? 'text-error' : 'text-text-secondary'}`}
    >
      {count} / {limit}
    </span>
  )
}
