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
    if (!(err instanceof ApiError)) return
    const refused = err.status !== undefined && err.status >= 400 && err.status < 500
    if (refused && err.code !== 'request_in_progress') setKey(crypto.randomUUID())
  }, [])
  return { key, settle }
}
