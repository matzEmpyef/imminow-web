import { useCallback, useState } from 'react'
import { ApiError } from '@/api/errors'

/**
 * One `Idempotency-Key` for as long as a form is open, so a double click or a retry after a lost
 * response replays the first answer instead of writing twice.
 *
 * The server stores a REFUSED write's answer under the key too (any 4xx; only a 5xx is not kept),
 * and a replay returns that stored answer even when the retry's body differs. So after a 409
 * `more_than_owed` the admin who corrects the amount and presses the button again would get the
 * same refusal back for 24 hours. `settle` takes the mutation's error and mints a fresh key when
 * the server answered with a 4xx — the next submit is a new write. A network failure or a 5xx
 * keeps the key: that is exactly the case where the first attempt may have landed, and the replay
 * is what stops it landing twice. `request_in_progress` also keeps it: the first call is still
 * running and the duplicate must stay a duplicate.
 */
export function useIdempotencyKey() {
  const [key, setKey] = useState(() => crypto.randomUUID())
  const settle = useCallback((err: unknown) => {
    if (isClearRefusal(err)) setKey(crypto.randomUUID())
  }, [])
  return { key, settle }
}

/**
 * True when the server answered a retry with "this write already went through": a 409 whose
 * `details.idempotency` is `already_applied`, whatever its `code` (`conflict`, or
 * `request_in_progress` on the answer older clients get). The first attempt landed and only its
 * reply was lost, so the write is DONE. The caller closes the form, refreshes what the success
 * path refreshes and says so; it must never offer a resubmit or mint a new key, because a new key
 * is a second receipt, instalment or payout.
 */
export function isAlreadyApplied(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  return err.status === 409 && err.details?.idempotency === 'already_applied'
}

/** What the user is told when a write turns out to be recorded already. */
export const ALREADY_APPLIED_NOTICE = 'This was already recorded. The list has been refreshed.'

/**
 * True when the server definitely did NOT perform the write: it answered with a 4xx other than
 * `request_in_progress` and other than "already applied". Everything else — a network failure, a
 * timeout, a 5xx, a duplicate of a call that is still running, or a write that already went
 * through — is not a clean refusal: the write may exist, so the key must not be renewed.
 */
export function isClearRefusal(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  const refused = err.status !== undefined && err.status >= 400 && err.status < 500
  return refused && err.code !== 'request_in_progress' && !isAlreadyApplied(err)
}

/** JSON with object keys in sorted order, so the same content always reads the same whatever
 * order its fields were set in. */
function fingerprint(payload: unknown): string {
  return JSON.stringify(payload, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  )
}

/**
 * `useIdempotencyKey` with the key tied to WHAT is submitted: the key is made when the form opens
 * and `keyFor(payload)` returns that same key for every attempt with the same content, so a retry
 * after a lost response replays the first answer. A different payload gets a new key — the server
 * replays the first answer for a known key even when the body differs, so reusing it for edited
 * content would report a success for something that was never written.
 *
 * `settle` is as above: a clear refusal renews the key, an unclear failure keeps it. That includes
 * a 422 `idempotency_key_reused` (the server saw this key with a different body, which keying by
 * payload should prevent): it is a clear refusal, so the key is renewed.
 */
export function usePayloadIdempotencyKey() {
  // A mutable slot rather than state: the key is read at submit time, never rendered.
  const [slot] = useState<{ key: string; payload: string | null }>(() => ({
    key: crypto.randomUUID(),
    payload: null,
  }))
  const keyFor = useCallback(
    (payload: unknown) => {
      const print = fingerprint(payload)
      if (slot.payload !== null && slot.payload !== print) slot.key = crypto.randomUUID()
      slot.payload = print
      return slot.key
    },
    [slot],
  )
  const settle = useCallback(
    (err: unknown) => {
      if (!isClearRefusal(err)) return
      slot.key = crypto.randomUUID()
      slot.payload = null
    },
    [slot],
  )
  return { keyFor, settle }
}
