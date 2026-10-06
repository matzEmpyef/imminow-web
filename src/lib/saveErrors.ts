import type { Mutation } from '@tanstack/react-query'
import { ApiError, requestReference } from '@/api/errors'
import { showToast } from '@/lib/toast'

/**
 * The `meta` key a save uses to tell the global handler "the screen shows this failure itself".
 * Either `true`, or a function asked at the moment of failure. `useMutation` in `lib/useSave.ts`
 * sets it for every save in the console; nothing else needs to.
 */
export const SHOWS_OWN_ERROR = 'showsOwnError'

/** What is shown when a failure carries no words of its own. */
export const SAVE_FAILED_FALLBACK = 'That did not go through. Please try again.'

function screenShowsIt(meta: Record<string, unknown> | undefined): boolean {
  const flag = meta?.[SHOWS_OWN_ERROR]
  return typeof flag === 'function' ? Boolean((flag as () => unknown)()) : flag === true
}

/**
 * The ONE global handler for failed saves (review F-151), wired into the query client's mutation
 * cache. Any save that fails is shown as a message, unless the screen shows its own.
 *
 * Before this, a refused Void of an invoice or receipt, a lead allocation, a plan reopen and a
 * consultancy suspend showed nothing at all: the confirm stayed where it was and the operator
 * could not tell a refusal from a slow network. A handler at this level closes the whole class,
 * including for screens not written yet.
 *
 * A 401 is left out: when a session ends the login page says why (`lib/sessionNotice.ts`).
 */
export function reportFailedSave(
  error: unknown,
  _variables: unknown,
  _context: unknown,
  mutation: Pick<Mutation<unknown, unknown, unknown, unknown>, 'meta'>,
): void {
  if (screenShowsIt(mutation.meta)) return
  if (error instanceof ApiError && error.status === 401) return
  const message = error instanceof Error ? error.message.trim() : ''
  showToast(message || SAVE_FAILED_FALLBACK, 'error', { reference: requestReference(error) })
}
