import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))

import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { queryClient as appQueryClient } from '@/lib/queryClient'
import { SAVE_FAILED_FALLBACK, reportFailedSave } from '@/lib/saveErrors'
import { useToastStore } from '@/lib/toast'
import { useVoidInvoice } from '@/queries/invoicing'
import { fingerprint, useMutation } from './useSave'

// Review F-151: one global handler shows any failed save as a message, unless the screen shows
// its own. Which screens show their own is noticed by the shared `useMutation`, not declared.
function makeClient() {
  return new QueryClient({
    mutationCache: new MutationCache({ onError: reportFailedSave }),
    defaultOptions: { mutations: { retry: false } },
  })
}

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const refusal = () => new ApiError('Could not save.', { error: { code: 'conflict', message: 'This invoice has receipts.' } }, 409)
const failing = async () => {
  throw refusal()
}

const toasts = () => useToastStore.getState().toasts.map((t) => ({ message: t.message, tone: t.tone }))

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  vi.mocked(api.POST).mockReset()
})

describe('a failed save', () => {
  it('is shown as a message when the screen shows nothing of its own', async () => {
    // The screen only fires the save and watches `isPending`, like the inline Void confirm.
    const { result } = renderHook(
      () => {
        const save = useMutation({ mutationFn: failing })
        return { mutate: save.mutate, isPending: save.isPending }
      },
      { wrapper: wrapperFor(makeClient()) },
    )
    act(() => result.current.mutate())
    await waitFor(() => expect(toasts()).toEqual([{ message: 'This invoice has receipts.', tone: 'error' }]))
  })

  it('is left to the screen when the screen reads the error from the save', async () => {
    function Form() {
      const save = useMutation({ mutationFn: failing })
      return (
        <>
          <button onClick={() => save.mutate()}>Save</button>
          {save.isError && <p role="alert">{save.error.message}</p>}
        </>
      )
    }
    render(<Form />, { wrapper: wrapperFor(makeClient()) })
    act(() => screen.getByRole('button', { name: 'Save' }).click())
    expect(await screen.findByRole('alert')).toHaveTextContent('This invoice has receipts.')
    expect(toasts()).toEqual([])
  })

  it('is left to the screen when the call passes its own onError', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useMutation({ mutationFn: failing }).mutate, {
      wrapper: wrapperFor(makeClient()),
    })
    act(() => result.current(undefined, { onError }))
    await waitFor(() => expect(onError).toHaveBeenCalled())
    expect(toasts()).toEqual([])
  })

  it('is left to the caller of mutateAsync, who receives the failure', async () => {
    const { result } = renderHook(() => useMutation({ mutationFn: failing }).mutateAsync, {
      wrapper: wrapperFor(makeClient()),
    })
    await expect(result.current()).rejects.toThrow('This invoice has receipts.')
    expect(toasts()).toEqual([])
  })

  it('is shown as a message when the screen that would have shown it has closed', async () => {
    let fail: ((error: Error) => void) | undefined
    const slow = () => new Promise<void>((_resolve, reject) => (fail = reject))
    function Dialog() {
      const save = useMutation({ mutationFn: slow })
      return (
        <>
          <button onClick={() => save.mutate()}>Save</button>
          {save.isError && <p role="alert">{save.error.message}</p>}
        </>
      )
    }
    const { unmount } = render(<Dialog />, { wrapper: wrapperFor(makeClient()) })
    act(() => screen.getByRole('button', { name: 'Save' }).click())
    await waitFor(() => expect(fail).toBeDefined())
    unmount()
    await act(async () => fail!(refusal()))
    await waitFor(() => expect(toasts()).toEqual([{ message: 'This invoice has receipts.', tone: 'error' }]))
  })

  it('says something even when the failure has no words', async () => {
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => {
            throw new Error('')
          },
        }).mutate,
      { wrapper: wrapperFor(makeClient()) },
    )
    act(() => result.current())
    await waitFor(() => expect(toasts()).toEqual([{ message: SAVE_FAILED_FALLBACK, tone: 'error' }]))
  })

  it('is not announced when it is the session ending: the login page says that', async () => {
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => {
            throw new ApiError('Sign in again.', undefined, 401)
          },
        }).mutate,
      { wrapper: wrapperFor(makeClient()) },
    )
    act(() => result.current())
    await new Promise((r) => setTimeout(r, 20))
    expect(toasts()).toEqual([])
  })
})

describe('the shared useMutation', () => {
  it('is React Query\'s own in every other respect: data, callbacks, a stable mutate', async () => {
    const onSuccess = vi.fn()
    const { result, rerender } = renderHook(
      () => useMutation({ mutationFn: async (n: number) => n * 2, onSuccess }),
      { wrapper: wrapperFor(makeClient()) },
    )
    const first = result.current.mutate
    rerender()
    expect(result.current.mutate).toBe(first)
    act(() => result.current.mutate(21))
    await waitFor(() => expect(result.current.data).toBe(42))
    expect(onSuccess).toHaveBeenCalled()
    expect(toasts()).toEqual([])
  })

  it('keeps a query module\'s own meta', async () => {
    const client = makeClient()
    const { result } = renderHook(
      () => useMutation({ mutationFn: async () => 1, meta: { audit: 'kept' } }).mutate,
      { wrapper: wrapperFor(client) },
    )
    act(() => result.current())
    await waitFor(() => expect(client.getMutationCache().getAll()[0]?.meta).toMatchObject({ audit: 'kept' }))
  })
})

describe('in the console as wired', () => {
  it("a refused Void (which shows nothing itself) surfaces the server's reason", async () => {
    vi.mocked(api.POST).mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'conflict', message: 'An invoice with receipts cannot be voided.', status: 409 } },
      response: { status: 409 },
    } as never)
    const { result } = renderHook(
      () => {
        const voidInvoice = useVoidInvoice()
        return { mutate: voidInvoice.mutate, isPending: voidInvoice.isPending }
      },
      { wrapper: wrapperFor(appQueryClient) },
    )
    act(() => result.current.mutate({ id: 'inv-1', reason: 'Raised twice' }))
    await waitFor(() =>
      expect(toasts()).toEqual([{ message: 'An invoice with receipts cannot be voided.', tone: 'error' }]),
    )
  })

  it('every query module uses the shared useMutation, so no save can opt out by accident', () => {
    const sources = import.meta.glob(['../queries/*.ts', '../features/**/*.{ts,tsx}', '../components/*.tsx'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.includes('.test.'))
      .filter(([, text]) => /import \{[^}]*\buseMutation\b[^}]*\} from '@tanstack\/react-query'/.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})

// Review F-152: one guard on every save. A second identical submit while the first is in flight
// is ignored; anything different, or anything later, goes through.
describe('a second submit while the first is in flight', () => {
  function setup() {
    const pending: { resolve: (value: string) => void; reject: (error: Error) => void }[] = []
    const mutationFn = vi.fn(
      (_body: { name: string }) => new Promise<string>((resolve, reject) => pending.push({ resolve, reject })),
    )
    const hook = renderHook(() => useMutation({ mutationFn }), { wrapper: wrapperFor(makeClient()) })
    return { mutationFn, pending, hook }
  }

  it('is ignored when it carries the same content (Enter pressed twice)', async () => {
    const { mutationFn, pending, hook } = setup()
    act(() => {
      hook.result.current.mutate({ name: 'Asha Nair' })
      hook.result.current.mutate({ name: 'Asha Nair' })
      hook.result.current.mutate({ name: 'Asha Nair' })
    })
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    await act(async () => pending[0].resolve('created'))
    await waitFor(() => expect(hook.result.current.data).toBe('created'))
    expect(mutationFn).toHaveBeenCalledTimes(1)
  })

  it('still fires the callbacks of the submit that went through', async () => {
    const { pending, hook } = setup()
    const onSuccess = vi.fn()
    act(() => {
      hook.result.current.mutate({ name: 'Asha' }, { onSuccess })
      hook.result.current.mutate({ name: 'Asha' }, { onSuccess })
    })
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve('created'))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('goes through when the content differs (the next row of a batch)', async () => {
    const { mutationFn, hook } = setup()
    act(() => {
      hook.result.current.mutate({ name: 'Asha' })
      hook.result.current.mutate({ name: 'Ravi' })
    })
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(2))
  })

  it('goes through once the first has finished, whether it worked or failed', async () => {
    const { mutationFn, pending, hook } = setup()
    act(() => hook.result.current.mutate({ name: 'Asha' }))
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].reject(new Error('The server refused.')))
    await waitFor(() => expect(hook.result.current.isError).toBe(true))

    act(() => hook.result.current.mutate({ name: 'Asha' }))
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(2))
    await act(async () => pending[1].resolve('created'))

    act(() => hook.result.current.mutate({ name: 'Asha' }))
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(3))
  })

  it('hands a duplicate mutateAsync the promise already in flight', async () => {
    const { mutationFn, pending, hook } = setup()
    let first!: Promise<string>
    let second!: Promise<string>
    act(() => {
      first = hook.result.current.mutateAsync({ name: 'Asha' })
      second = hook.result.current.mutateAsync({ name: 'Asha' })
    })
    expect(second).toBe(first)
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve('created'))
    await expect(second).resolves.toBe('created')
    expect(mutationFn).toHaveBeenCalledTimes(1)
  })
})

describe('fingerprint', () => {
  it('is the same for the same content', () => {
    expect(fingerprint({ name: 'A', n: 1 })).toBe(fingerprint({ name: 'A', n: 1 }))
    expect(fingerprint(undefined)).toBe(fingerprint(undefined))
    expect(fingerprint('lead-1')).toBe(fingerprint('lead-1'))
  })

  it('tells different content apart', () => {
    expect(fingerprint({ name: 'A' })).not.toBe(fingerprint({ name: 'B' }))
    expect(fingerprint({ idempotencyKey: 'k1', amount: 5 })).not.toBe(fingerprint({ idempotencyKey: 'k2', amount: 5 }))
  })

  it('tells two different files apart, and knows the same file', () => {
    const a = new File(['aaaa'], 'passport.pdf', { lastModified: 1 })
    const b = new File(['bb'], 'marksheet.pdf', { lastModified: 1 })
    expect(fingerprint({ file: a })).not.toBe(fingerprint({ file: b }))
    expect(fingerprint({ file: a })).toBe(fingerprint({ file: a }))
  })

  it('declines to compare what cannot be compared, so such a submit is never dropped', () => {
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(fingerprint(loop)).toBeNull()
    expect(fingerprint({ onDone: () => {} })).toBeNull()
  })
})
