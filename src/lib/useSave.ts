import { useCallback, useEffect, useRef } from 'react'
import {
  useMutation as useBaseMutation,
  type DefaultError,
  type MutateOptions,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query'
import { SHOWS_OWN_ERROR } from '@/lib/saveErrors'

/**
 * What a submit carries, as text, so two submits can be compared. Files count by name, size and
 * date (two different attachments are two different saves). `null` means "cannot tell", and a
 * submit that cannot be compared is never treated as a duplicate.
 */
export function fingerprint(variables: unknown): string | null {
  try {
    return JSON.stringify(variables === undefined ? null : variables, (_key, value: unknown) => {
      if (typeof File !== 'undefined' && value instanceof File) {
        return `file:${value.name}:${value.size}:${value.lastModified}`
      }
      if (typeof Blob !== 'undefined' && value instanceof Blob) return `blob:${value.size}:${value.type}`
      if (typeof FormData !== 'undefined' && value instanceof FormData) return [...value.entries()]
      if (value instanceof Map) return ['map', ...value.entries()]
      if (value instanceof Set) return ['set', ...value.values()]
      if (typeof value === 'function' || typeof value === 'symbol') throw new Error('not comparable')
      return value
    })
  } catch {
    return null
  }
}

/**
 * The console's `useMutation`: React Query's own, with the same arguments and the same result,
 * plus the two things every save in the console should have and used to get only where someone
 * remembered. Every query module imports `useMutation` from here (a test fails on an import of
 * the bare one).
 *
 * A FAILED SAVE IS NEVER SILENT (review F-151). The one global handler (`lib/saveErrors.ts`,
 * wired into the query client) shows any failed save as a message, unless the screen shows its
 * own. Nobody has to declare which screens do: this hook notices. A screen shows its own error
 * when, for this save, it
 *
 *   - reads `error` or `isError` from the result (the `{save.isError && <p>{save.error.message}</p>}`
 *     every form with an inline message has), or
 *   - passes `onError` to `mutate(...)`, or
 *   - uses `mutateAsync(...)`, whose failure the caller receives itself.
 *
 * The first two count only while the screen is still mounted: a dialog closed before its save
 * failed can no longer show anything, so the global message appears. A screen that does none of
 * these (the inline Void confirm, Allocate, Reopen plan, Suspend — the cases the review found)
 * gets the global message with no change to the screen.
 *
 * A SECOND IDENTICAL SUBMIT IS IGNORED WHILE THE FIRST IS IN FLIGHT (review F-152). Pressing Enter
 * twice before the button repaints as disabled used to send the save twice: two applicants, two
 * leads, two coupons, two events. Nine forms had a hand-written check; every save has this one.
 * The check is a plain ref read in the same tick as the click (React state is too late: it is
 * the repaint that is slow). "Identical" means the same content (`fingerprint`), so a different
 * save from the same screen — the next row of a batch, a second file — is never held back, and
 * the same content can be sent again as soon as the first attempt has finished, whatever its
 * result. A duplicate `mutateAsync` is handed the promise already in flight.
 */
export function useMutation<TData = unknown, TError = DefaultError, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
  queryClient?: QueryClient,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /** The screen reads the failure from the result object. */
  const readsError = useRef(false)
  /** The call in flight was given its own `onError`. */
  const callHasOnError = useRef(false)
  /** The call in flight was made with `mutateAsync`: its caller holds the failure. */
  const callIsAsync = useRef(false)

  // One function for the life of the hook, read by the global handler at the moment of failure.
  const showsOwnError = useRef(
    () => callIsAsync.current || (mounted.current && (readsError.current || callHasOnError.current)),
  )

  const base = useBaseMutation(
    { ...options, meta: { ...options.meta, [SHOWS_OWN_ERROR]: showsOwnError.current } },
    queryClient,
  )

  const { mutateAsync: baseMutateAsync } = base

  /** The submit on its way to the server, if any: what it carries and the promise for its result. */
  const inFlight = useRef<{ key: string; promise: Promise<TData> } | null>(null)

  const submit = useCallback(
    (
      variables: TVariables,
      callOptions: MutateOptions<TData, TError, TVariables, TContext> | undefined,
      isAsync: boolean,
    ): Promise<TData> | null => {
      const key = fingerprint(variables)
      if (key !== null && inFlight.current?.key === key) return isAsync ? inFlight.current.promise : null
      callIsAsync.current = isAsync
      callHasOnError.current = Boolean(callOptions?.onError)
      const promise = baseMutateAsync(variables, callOptions)
      if (key !== null) {
        const mine = { key, promise }
        inFlight.current = mine
        const done = () => {
          if (inFlight.current === mine) inFlight.current = null
        }
        promise.then(done, done)
      }
      return promise
    },
    [baseMutateAsync],
  )

  // Same identity across renders, as React Query's own `mutate` has (effects list it as a
  // dependency; `queries/mutateStability.test.tsx` pins that). And, like React Query's own, it
  // is `mutateAsync` with the rejection swallowed: the failure is reported through the callbacks
  // and the result, never as an unhandled promise.
  const mutate = useCallback(
    (variables: TVariables, callOptions?: MutateOptions<TData, TError, TVariables, TContext>) => {
      submit(variables, callOptions, false)?.catch(() => {})
    },
    [submit],
  )

  const mutateAsync = useCallback(
    (variables: TVariables, callOptions?: MutateOptions<TData, TError, TVariables, TContext>) =>
      submit(variables, callOptions, true) as Promise<TData>,
    [submit],
  )

  const result = { ...base, mutate, mutateAsync } as UseMutationResult<TData, TError, TVariables, TContext>
  for (const key of ['error', 'isError'] as const) {
    Object.defineProperty(result, key, {
      enumerable: true,
      configurable: true,
      get() {
        readsError.current = true
        return base[key]
      },
    })
  }
  return result
}
