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
 * The console's `useMutation`: React Query's own, with the same arguments and the same result,
 * plus the one thing every save in the console should have and used to get only where someone
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

  const { mutate: baseMutate, mutateAsync: baseMutateAsync } = base

  // Same identity across renders, as React Query's own `mutate` has (effects list it as a
  // dependency; `queries/mutateStability.test.tsx` pins that).
  const mutate = useCallback(
    (variables: TVariables, callOptions?: MutateOptions<TData, TError, TVariables, TContext>) => {
      callIsAsync.current = false
      callHasOnError.current = Boolean(callOptions?.onError)
      baseMutate(variables, callOptions)
    },
    [baseMutate],
  )

  const mutateAsync = useCallback(
    (variables: TVariables, callOptions?: MutateOptions<TData, TError, TVariables, TContext>) => {
      callIsAsync.current = true
      callHasOnError.current = Boolean(callOptions?.onError)
      return baseMutateAsync(variables, callOptions)
    },
    [baseMutateAsync],
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
