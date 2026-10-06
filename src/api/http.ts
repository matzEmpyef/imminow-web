import { ApiError } from './errors'

/**
 * The one `fetch` every request in the console goes through (review F-150). It adds what the
 * browser's own `fetch` leaves out:
 *
 *   - a time limit. A request that hangs used to leave the button disabled and the spinner turning
 *     for ever; it now fails after `timeoutFor()` seconds with a message a person can act on;
 *   - a plain message when there is no connection. People used to read the browser's own text
 *     ("Failed to fetch", "Load failed") on almost every form;
 *   - an immediate failure when the browser already knows it is offline, so a save pressed
 *     offline says so at once and is never sent later, on its own, after the dialog was closed.
 *
 * Every failure is an `ApiError` with NO status — "there was no answer" — which is what the retry
 * rule reads (`isRetryable`). A request the caller cancelled itself (a search the person typed
 * past) is not a failure and is passed through as the browser reports it.
 */
export const NO_CONNECTION_MESSAGE = 'No connection. Check your internet and try again.'
export const OFFLINE_MESSAGE = 'You are offline. Nothing was sent. Try again when you are back online.'
export const TIMEOUT_MESSAGE = 'The server took too long to answer. Check your connection and try again.'

const DEFAULT_TIMEOUT_MS = 30_000
/** Sending or processing a file can honestly take longer than a page of data. */
const LONG_TIMEOUT_MS = 120_000
const LONG_RUNNING = /\/(file-uploads|uploads|import|exports?)(\/|\?|$)/

/** How long a request may take: 30 seconds, or two minutes for uploads, imports and exports. */
export function timeoutFor(url: string): number {
  return LONG_RUNNING.test(url) ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS
}

function noAnswer(code: 'offline' | 'network_error' | 'timeout', message: string): ApiError {
  return new ApiError(message, { error: { code, message } })
}

/** False only when the browser is sure there is no network. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export async function guardedFetch(
  input: Request | string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  if (!isOnline()) throw noAnswer('offline', OFFLINE_MESSAGE)

  const url = typeof input === 'string' ? input : input.url
  const callerSignal = (typeof input === 'string' ? undefined : input.signal) ?? undefined
  const givenSignal = init?.signal ?? callerSignal
  const { timeoutMs = timeoutFor(url), ...rest } = init ?? {}

  // One controller stands for "stop": the time limit running out, or the caller cancelling.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onCallerAbort = () => controller.abort()
  if (givenSignal?.aborted) controller.abort()
  else givenSignal?.addEventListener('abort', onCallerAbort, { once: true })

  try {
    // `globalThis.fetch` is looked up on each call, not captured, so a test can replace it.
    return await globalThis.fetch(input, { ...rest, signal: controller.signal })
  } catch (error) {
    if (timedOut) throw noAnswer('timeout', TIMEOUT_MESSAGE)
    // The caller walked away: not a failure, and React Query expects the browser's own rejection.
    if (givenSignal?.aborted) throw error
    throw noAnswer(isOnline() ? 'network_error' : 'offline', isOnline() ? NO_CONNECTION_MESSAGE : OFFLINE_MESSAGE)
  } finally {
    clearTimeout(timer)
    givenSignal?.removeEventListener('abort', onCallerAbort)
  }
}
